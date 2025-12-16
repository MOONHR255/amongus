// StudentPlay.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, storage } from '../firebase';
import { 
  doc, 
  getDoc, 
  getDocs,
  collection,
  updateDoc,
  addDoc,
  increment,
  runTransaction,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { checkAnswer } from '../utils/answerChecker';
import OpenAI from 'openai';
import imageCompression from 'browser-image-compression';

// OpenAI 클라이언트는 함수 내에서 동적으로 생성

export default function StudentPlay() {
  const { activityId, teamId, questionId } = useParams();
  const [question, setQuestion] = useState(null);
  const [team, setTeam] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [statusMessage, setStatusMessage] = useState(''); // 제출 상태 메시지: '', 'compressing', 'uploading', 'analyzing', 'completed'
  const [isCompleted, setIsCompleted] = useState(false); // 이미 완료된 문제인지 확인
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState(''); // 마지막으로 제출한 답안
  const [result, setResult] = useState(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showJokerModal, setShowJokerModal] = useState(false);
  const [jokerStudentName, setJokerStudentName] = useState('');

  // 새로 추가된 상태
  const [studentName, setStudentName] = useState('');
  const [studentSolution, setStudentSolution] = useState('');
  const [selectedFile, setSelectedFile] = useState(null); // 사용자가 선택한 원본 파일 객체
  const [selectedImage, setSelectedImage] = useState(null); // 압축된 파일 객체 (업로드용)
  const [imagePreview, setImagePreview] = useState(null); // 미리보기용 base64 URL
  const [uploading, setUploading] = useState(false); // 업로드 중 로딩 표시용
  const [aiFeedback, setAiFeedback] = useState(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [savedImageUrl, setSavedImageUrl] = useState(null); // 복구된 이미지 URL
  
  // 고유번호 관련 상태
  const [accessCode, setAccessCode] = useState(''); // 입력한 고유번호
  const [isAccessCodeVerified, setIsAccessCodeVerified] = useState(false); // 고유번호 검증 완료 여부
  const [verifiedTeamId, setVerifiedTeamId] = useState(null); // 검증된 팀 ID
  const [verifiedTeamName, setVerifiedTeamName] = useState(''); // 검증된 팀 이름
  const [accessCodeError, setAccessCodeError] = useState(''); // 고유번호 오류 메시지

  // 학생 이름은 localStorage에 저장하지 않음 (매번 빈 칸으로 시작)

  // 문제 및 팀 정보 로드 및 제출 내용 복구
  useEffect(() => {
    const loadData = async () => {
      try {
        // 팀 정보 로드
        const activityRef = doc(db, 'activities', activityId);
        const teamRef = doc(activityRef, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const teamData = { id: teamSnap.id, ...teamSnap.data() };
          setTeam(teamData);
          setCurrentScore(teamData.score || 0);
        }

        // 문제 정보 로드
        const questionsSnapshot = await getDocs(collection(teamRef, 'questions'));
        const foundQuestion = questionsSnapshot.docs.find(
          (qDoc) => qDoc.data().questionId === questionId || qDoc.id === questionId
        );
        
        if (foundQuestion) {
          const questionData = { id: foundQuestion.id, ...foundQuestion.data() };
          setQuestion(questionData);
          
          // 이미 완료된 문제인지 확인
          if (questionData.completed) {
            setIsCompleted(true);
            setIsSubmitted(true);
          }
          
          // 이전 제출 내용 복구 (submissions 컬렉션에서 최신 기록 가져오기)
          // 주의: 학생 이름은 복구하지 않음 (새 문제마다 빈 칸으로 시작)
          try {
            const submissionsQuery = query(
              collection(db, 'submissions'),
              where('activityId', '==', activityId),
              where('teamId', '==', teamId),
              where('questionId', '==', questionId),
              orderBy('submittedAt', 'desc'),
              limit(1)
            );
            
            const submissionsSnapshot = await getDocs(submissionsQuery);
            if (!submissionsSnapshot.empty) {
              const latestSubmission = submissionsSnapshot.docs[0].data();
              
              // 상태 복구 (학생 이름 제외)
              // 학생 이름은 복구하지 않음 - 새 문제마다 빈 칸으로 시작
              
              if (latestSubmission.studentSolution) {
                setStudentSolution(latestSubmission.studentSolution);
              }
              
              if (latestSubmission.aiFeedback) {
                setAiFeedback(latestSubmission.aiFeedback);
              }
              
              if (latestSubmission.imageUrl) {
                setSavedImageUrl(latestSubmission.imageUrl);
                setImagePreview(latestSubmission.imageUrl);
              }
              
              // 정답 여부 확인하여 완료 상태 복구
              if (latestSubmission.isCorrect) {
                setIsCompleted(true);
                setIsSubmitted(true);
                setResult({ type: 'success', message: `미션 완료! +${questionData.score || 0}점!` });
              } else {
                // 오답인 경우 제출 상태만 복구 (재시도 가능)
                setIsSubmitted(true);
              }
            }
          } catch (submissionError) {
            console.error('제출 내용 복구 오류:', submissionError);
            // 제출 내용 복구 실패해도 계속 진행
          }
        } else {
          alert('문제를 찾을 수 없습니다.');
        }
      } catch (error) {
        console.error('데이터 로드 오류:', error);
        alert('데이터를 불러오는 중 오류가 발생했습니다.');
      }
    };

    if (activityId && teamId && questionId) {
      loadData();
    }
  }, [activityId, teamId, questionId]);

  // 고유번호 검증 함수 (재사용 가능)
  const verifyAccessCode = async (code) => {
    if (!code || code.length !== 3) {
      setAccessCodeError('3자리 숫자를 입력해주세요.');
      return false;
    }
    
    try {
      const activityRef = doc(db, 'activities', activityId);
      
      // 모든 팀의 access_codes 검색 (is_used 체크 제거 - 재사용 가능)
      const teamsSnapshot = await getDocs(collection(activityRef, 'teams'));
      
      for (const teamDoc of teamsSnapshot.docs) {
        const teamRef = doc(activityRef, 'teams', teamDoc.id);
        const accessCodesSnapshot = await getDocs(
          query(
            collection(teamRef, 'access_codes'),
            where('code', '==', code)
          )
        );
        
        if (!accessCodesSnapshot.empty) {
          // 고유번호를 찾았음 (재사용 가능하므로 is_used 체크 없음)
          const teamData = teamDoc.data();
          
          // 검증된 팀 정보 저장
          setVerifiedTeamId(teamDoc.id);
          setVerifiedTeamName(teamData.name);
          setIsAccessCodeVerified(true);
          setAccessCodeError('');
          
          // 팀 정보 업데이트
          setTeam({ id: teamDoc.id, ...teamData });
          setCurrentScore(teamData.score || 0);
          
          return true;
        }
      }
      
      // 고유번호를 찾지 못함
      setAccessCodeError('유효하지 않은 고유번호입니다.');
      return false;
    } catch (error) {
      console.error('고유번호 검증 오류:', error);
      setAccessCodeError('고유번호 검증 중 오류가 발생했습니다.');
      return false;
    }
  };

  // 퇴출된 학생 확인 함수
  const checkEliminated = async (name) => {
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('activityId', '==', activityId)
      );
      
      const notificationsSnapshot = await getDocs(notificationsQuery);
      
      // 이름을 정규화 (공백 제거)
      const normalizedName = name.trim();
      
      for (const notifDoc of notificationsSnapshot.docs) {
        const notifData = notifDoc.data();
        if (notifData.text && notifData.text.includes('퇴출')) {
          // 알림 텍스트에서 학생 이름 추출 (정확한 패턴만 사용)
          const text = notifData.text;
          let eliminatedName = '';
          
          // 새로운 포맷: ['활동명'] 의 '사용자명' 퇴출
          if (text.includes("'") && text.includes('퇴출')) {
            const match = text.match(/'([^']+)' 퇴출/);
            eliminatedName = match ? match[1].trim() : '';
          }
          // 기존 포맷: "~ 학생이 퇴출되었습니다!" (하위 호환성)
          else if (text.includes('학생이 퇴출되었습니다')) {
            eliminatedName = text.split(' 학생이 퇴출되었습니다')[0].trim();
          }
          
          // 정확한 이름 매칭 (부분 문자열이 아닌 완전 일치)
          if (eliminatedName === normalizedName) {
            console.log('퇴출 확인됨 (정확한 매칭):', normalizedName);
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('퇴출 확인 오류:', error);
      // 에러 발생 시 제출 허용 (서버 오류 등으로 인한 차단 방지)
      // 하지만 콘솔에 경고를 남겨서 관리자가 확인할 수 있도록 함
      return false;
    }
  };

  // 파일 선택 핸들러
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setSelectedFile(null);
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }

    // 원본 파일 저장
    setSelectedFile(file);
    setIsCompressingImage(true);

    try {
      // 이미지 압축 옵션
      const options = {
        maxSizeMB: 0.2, // 최대 200KB
        maxWidthOrHeight: 800, // 최대 800px
        useWebWorker: true
      };
      
      const compressedFile = await imageCompression(file, options);
      setSelectedImage(compressedFile);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setIsCompressingImage(false);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('이미지 압축 오류:', error);
      alert('이미지 압축에 실패했습니다. 원본 파일을 사용합니다.');
      // 압축 실패 시 원본 파일 사용
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setIsCompressingImage(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // 정답 제출
  const handleSubmit = async () => {
    // 1. 고유번호 검증 확인
    if (!isAccessCodeVerified || !verifiedTeamId) {
      alert('고유번호를 먼저 입력해주세요.');
      return;
    }
    
    // 2. 팀 검증 (정답 제출 시 엄격한 검증)
    if (verifiedTeamId !== teamId) {
      const teamName = team?.name || '알 수 없는 팀';
      alert(`${teamName}이 아니므로 정답을 제출할 수 없습니다.`);
      return;
    }
    
    // 3. 퇴출된 학생인지 확인
    if (!studentName || !studentName.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }
    
    // 퇴출 확인은 반드시 이름 입력 후 실행
    const isEliminated = await checkEliminated(studentName.trim());
    if (isEliminated) {
      alert("이미 퇴출된 플레이어입니다. 답안을 제출할 수 없습니다.");
      return; // 즉시 함수 종료 - 절대 뒤쪽 로직 실행 안 됨
    }

    // 제출 중이거나, 이미 완료되었거나, 답안이 비어있거나, 마지막 제출한 답안과 같으면 제출 불가
    if (!question || !team || statusMessage || isCompleted || !userAnswer.trim() || uploading) {
      return;
    }

    // 마지막으로 제출한 답안과 같으면 제출 불가
    if (lastSubmittedAnswer === userAnswer.trim()) {
      return;
    }

    // 로딩 시작
    setUploading(true);
    setStatusMessage('업로드 및 분석 중...');

    const isCorrect = checkAnswer(userAnswer, question.answer);
    let imageUrl = null;
    let timeoutId = null;
    
    // 타임아웃 설정 (30초)
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('타임아웃'));
      }, 30000);
    });

    try {
      const activityRef = doc(db, 'activities', activityId);
      const teamRef = doc(activityRef, 'teams', teamId);

      // (3) 이미지 업로드 (핵심)
      if (selectedImage) {
        try {
          setStatusMessage('☁️ 서버에 올리는 중...');
          
          // Firebase Storage에 업로드
          const storageRef = ref(storage, `solutions/${activityId}/${Date.now()}_${selectedImage.name}`);
          await uploadBytes(storageRef, selectedImage);
          
          // 다운로드 URL 가져오기
          imageUrl = await getDownloadURL(storageRef);
          console.log('이미지 업로드 성공:', imageUrl);
        } catch (uploadError) {
          console.error('이미지 업로드 오류 상세:', uploadError);
          const errorMessage = uploadError.message || '알 수 없는 오류';
          alert(`이미지 업로드 실패: ${errorMessage}\n잠시 후 다시 시도해주세요.`);
          setStatusMessage('');
          setUploading(false);
          return;
        }
      } else {
        // 파일이 없다면 imageUrl은 null
        imageUrl = null;
      }

      if (isCorrect) {
        // 정답인 경우
        const questionRef = doc(teamRef, 'questions', question.id);
        
        // 점수 업데이트 및 문제 완료 표시
        await updateDoc(teamRef, {
          score: increment(question.score)
        });
        
        // 문제 문서에 완료 표시
        await updateDoc(questionRef, {
          completed: true,
          completedAt: new Date()
        });
        
        setCurrentScore((prev) => prev + question.score);
        setResult({ type: 'success', message: `미션 완료! +${question.score}점!` });
        setIsSubmitted(true);
        setIsCompleted(true);
        setLastSubmittedAnswer(userAnswer.trim());
        // 제출 후 이름은 빈 칸으로 초기화
        setStudentName('');

        // 조커 로직
        if (team.type === 'joker') {
          setShowJokerModal(true);
        }
      } else {
        // 오답인 경우
        await updateDoc(teamRef, {
          score: increment(-3)
        });
        
        setCurrentScore((prev) => prev - 3);
        setResult({ type: 'error', message: '틀렸습니다. -3점' });
        setLastSubmittedAnswer(userAnswer.trim()); // 마지막 제출 답안 저장
        
        // 제출 직후 풀이를 보여주기 위해 이미지 URL 저장
        if (imageUrl) {
          setSavedImageUrl(imageUrl);
        }
        
        // 제출 직후 화면 표시를 위해 isSubmitted를 true로 설정 (재시도는 나중에 가능)
        setIsSubmitted(true);
        // 제출 후 이름은 빈 칸으로 초기화
        setStudentName('');
      }

      // 서술형 풀이가 있으면 AI 피드백 생성 (정답/오답 모두 허용)
      // 이미지가 없어도 텍스트만 있어도 피드백 작동하도록 수정
      if (studentSolution.trim() || imageUrl) {
        // API Key 확인 (Vite 환경 변수 규칙 준수)
        console.log("API Key 확인:", import.meta.env.VITE_OPENAI_API_KEY);
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey || !apiKey.trim()) {
          alert('API Key가 설정되지 않았습니다. .env 파일을 확인하세요.');
          setStatusMessage('');
          return;
        }

        // OpenAI 클라이언트 생성 (매번 새로 생성하여 API Key 확인)
        const openaiClient = new OpenAI({
          apiKey: apiKey,
          dangerouslyAllowBrowser: true
        });

        // 3단계: AI 분석
        setStatusMessage('🤖 AI가 읽는 중...');
        setIsGeneratingFeedback(true);
        
        try {
          // 교육과정 내용 가져오기 (문제 또는 활동에서)
          let educationalContext = '';
          if (question.educationalContext) {
            educationalContext = question.educationalContext;
          } else {
            // 활동에서 가져오기
            const activitySnap = await getDoc(doc(db, 'activities', activityId));
            if (activitySnap.exists() && activitySnap.data().educationalContext) {
              educationalContext = activitySnap.data().educationalContext;
            }
          }

          // 정답 여부에 따라 다른 톤으로 피드백
          const isCorrectMessage = isCorrect 
            ? '학생이 정답을 맞췄으니 칭찬하는 톤으로 답변해줘.'
            : '학생이 틀렸으니 격려하고 힌트를 주는 톤으로 답변해줘.';
          
          // 시스템 프롬프트 강화
          const systemMessage = `너는 친절한 초중고 수학 선생님이야. 학생의 풀이를 보고 50자~100자 이내로 짧고 명확하게 피드백해줘. ${isCorrectMessage} ${educationalContext ? `educationalContext(교과서 내용): ${educationalContext} 이걸 바탕으로 설명해줘.` : ''} 학생이 이미지를 올렸다면, 이미지 속의 수식이나 풀이 과정을 꼼꼼히 읽고 피드백해줘. 정답 여부와 관계없이 칭찬과 보완할 점을 100자 내외로 말해줘.`;

          // AI 메시지 구성 로직 전면 수정
          // content 배열을 빈 배열로 시작
          const contentArray = [];
          
          // 1. 텍스트 풀이 추가
          const textContent = studentSolution.trim() 
            ? `문제: ${question.questionText}\n\n학생 풀이: ${studentSolution.trim()}`
            : imageUrl 
              ? `문제: ${question.questionText}\n\n학생이 사진으로 풀이를 제출했습니다.`
              : `문제: ${question.questionText}\n\n학생 풀이: (텍스트 없음)`;
          
          // 텍스트 풀이를 content 배열에 push
          contentArray.push({
            type: 'text',
            text: textContent
          });
          
          // 2. 이미지 풀이 추가 (imageUrl이 존재하는 경우만)
          if (imageUrl) {
            contentArray.push({
              type: 'image_url',
              image_url: {
                url: imageUrl // Firebase Storage에서 받은 downloadURL만 사용
              }
            });
          }
          
          // 3. 완성된 content 배열을 user 메시지로 전송
          const userMessage = {
            role: 'user',
            content: contentArray
          };

          const messages = [
            {
              role: 'system',
              content: systemMessage
            },
            userMessage
          ];

          // 디버깅: AI에게 보낼 데이터 확인
          console.log('AI에게 보낼 데이터:', JSON.stringify(messages, null, 2));
          console.log('AI 호출 시작...', { model: 'gpt-4o', messagesCount: messages.length });
          
          // OpenAI 호출 (강화된 try-catch)
          const aiPromise = openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            max_tokens: 300
          });

          const completion = await Promise.race([aiPromise, timeoutPromise]);
          
          // 디버깅: OpenAI 전체 응답 확인
          console.log('OpenAI 전체 응답:', completion);
          
          // 응답 추출 로직 안전하게 수정
          const aiContent = completion.choices?.[0]?.message?.content;
          
          if (!aiContent) {
            console.error('AI 응답 내용 없음. 전체 응답:', completion);
            // 에러를 throw하지 않고 기본 문구를 설정
            setAiFeedback('AI 피드백을 불러오지 못했습니다. (잠시 후 다시 시도해주세요)');
          } else {
            console.log('AI 피드백:', aiContent);
            setAiFeedback(aiContent);
          }
          
          // 제출 직후 이미지 URL 저장 (화면 표시용)
          if (imageUrl) {
            setSavedImageUrl(imageUrl);
          }

          // submissions 컬렉션에 저장 (teamName 포함)
          await addDoc(collection(db, 'submissions'), {
            studentName: studentName.trim(),
            teamName: team.name || '알 수 없음',
            activityId: activityId,
            teamId: teamId,
            questionId: questionId,
            questionText: question.questionText,
            userAnswer: userAnswer.trim(), // 단답형 정답 추가
            studentSolution: studentSolution.trim() || '',
            imageUrl: imageUrl || null,
            aiFeedback: aiContent || 'AI 피드백을 불러오지 못했습니다.',
            submittedAt: new Date(),
            isCorrect: isCorrect
          });
          console.log('submissions 저장 완료');
        } catch (feedbackError) {
          if (feedbackError.message === '타임아웃') {
            alert('시간이 너무 오래 걸립니다. 다시 시도해주세요.');
            setStatusMessage('');
            setIsGeneratingFeedback(false);
            setUploading(false);
            return;
          }
          
          // 상세한 에러 로깅 및 사용자 알림
          console.error('AI 피드백 생성 오류 전체:', feedbackError);
          const errorMessage = feedbackError.message || '알 수 없는 오류';
          alert(`AI 피드백 오류: ${errorMessage}`);
          
          // 피드백 생성 실패해도 기본 정보는 저장 (teamName 포함)
          try {
            await addDoc(collection(db, 'submissions'), {
              studentName: studentName.trim(),
              teamName: team.name || '알 수 없음',
              activityId: activityId,
              teamId: teamId,
              questionId: questionId,
              questionText: question.questionText,
              studentSolution: studentSolution.trim() || '',
              imageUrl: imageUrl || null,
              aiFeedback: null,
              submittedAt: new Date(),
              isCorrect: isCorrect
            });
          } catch (saveError) {
            console.error('제출 정보 저장 오류:', saveError);
          }
          setStatusMessage('');
          setIsGeneratingFeedback(false);
        }
      } else if ((studentSolution.trim() || imageUrl)) {
        // OpenAI API 키가 없거나 AI 피드백이 실패한 경우에도 기본 정보는 저장 (teamName 포함)
        // 제출 직후 이미지 URL 저장 (화면 표시용)
        if (imageUrl) {
          setSavedImageUrl(imageUrl);
        }
        
        try {
          await addDoc(collection(db, 'submissions'), {
            studentName: studentName.trim(),
            teamName: team.name || '알 수 없음',
            activityId: activityId,
            teamId: teamId,
            questionId: questionId,
            questionText: question.questionText,
            userAnswer: userAnswer.trim(), // 단답형 정답 추가
            studentSolution: studentSolution.trim() || '',
            imageUrl: imageUrl || null,
            aiFeedback: null,
            submittedAt: new Date(),
            isCorrect: isCorrect
          });
        } catch (saveError) {
          console.error('제출 정보 저장 오류:', saveError);
          alert('잠시 후 다시 시도해주세요.');
        }
      }
      
      // 제출 직후 이미지 URL 저장 (AI 피드백 없이도 이미지 표시용)
      if (imageUrl && !savedImageUrl) {
        setSavedImageUrl(imageUrl);
      }

      // (6) 마무리: 완료 처리
      setStatusMessage('완료!');
      setIsGeneratingFeedback(false);
      setUploading(false);
      
      // 완료 메시지를 잠깐 보여준 후 초기화
      setTimeout(() => {
        setStatusMessage('');
      }, 1000);
      
    } catch (error) {
      if (error.message === '타임아웃') {
        alert('시간이 너무 오래 걸립니다. 다시 시도해주세요.');
      } else {
        console.error('제출 처리 오류:', error);
        alert('잠시 후 다시 시도해주세요.');
      }
      setStatusMessage('');
      setIsGeneratingFeedback(false);
      setUploading(false);
    } finally {
      // 타임아웃 타이머 정리
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  // 답안이 변경되었는지 확인 (제출 버튼 활성화 여부)
  const canSubmit = !statusMessage && !isCompleted && userAnswer.trim() && userAnswer.trim() !== lastSubmittedAnswer && studentName.trim();

  // 조커 퇴출 처리
  const handleJokerElimination = async () => {
    if (!jokerStudentName.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    try {
      // 중복 퇴출 방지: 이미 퇴출된 학생인지 확인
      const isAlreadyEliminated = await checkEliminated(jokerStudentName.trim());
      if (isAlreadyEliminated) {
        alert('이미 퇴출된 학생입니다.');
        return; // Firestore에 중복 저장하지 않음
      }

      const activityRef = doc(db, 'activities', activityId);
      
      // Transaction으로 모든 시민 팀 점수 차감
      await runTransaction(db, async (transaction) => {
        const teamsSnapshot = await getDocs(collection(activityRef, 'teams'));
        
        teamsSnapshot.docs.forEach((teamDoc) => {
          const teamData = teamDoc.data();
          if (teamData.type === 'citizen') {
            const teamRef = doc(activityRef, 'teams', teamDoc.id);
            transaction.update(teamRef, {
              score: increment(-2)
            });
          }
        });
      });

      // 활동 이름 가져오기
      const activitySnap = await getDoc(doc(db, 'activities', activityId));
      const activityName = activitySnap.exists() ? activitySnap.data().name : '활동';
      
      // 알림 추가 (activityId 및 활동 이름 포함)
      await addDoc(collection(db, 'notifications'), {
        text: `['${activityName}'] 의 '${jokerStudentName}' 퇴출`,
        timestamp: new Date(),
        activityId: activityId
      });

      setShowJokerModal(false);
      setJokerStudentName('');
    } catch (error) {
      console.error('조커 퇴출 처리 오류:', error);
      alert('퇴출 처리에 실패했습니다.');
    }
  };

  if (!question || !team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  // 고유번호 입력 화면
  if (!isAccessCodeVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">고유번호 입력</h2>
          <p className="text-gray-600 mb-4 text-center">관리자로부터 받은 3자리 고유번호를 입력하세요.</p>
          <div className="space-y-4">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 3);
                setAccessCode(value);
                setAccessCodeError('');
              }}
              placeholder="000"
              maxLength={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-2xl text-center font-bold tracking-widest"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && accessCode.length === 3) {
                  verifyAccessCode(accessCode);
                }
              }}
            />
            {accessCodeError && (
              <p className="text-red-600 text-sm text-center">{accessCodeError}</p>
            )}
            <button
              onClick={() => verifyAccessCode(accessCode)}
              disabled={accessCode.length !== 3}
              className={`w-full py-3 rounded-lg font-semibold text-lg transition-colors ${
                accessCode.length === 3
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* 점수 표시 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="text-center">
            <p className="text-gray-600 mb-2">현재 점수</p>
            <p className="text-4xl font-bold text-blue-600">{currentScore}점</p>
            {verifiedTeamName && (
              <p className="text-sm text-gray-500 mt-2">소속 팀: {verifiedTeamName}</p>
            )}
          </div>
        </div>

        {/* 문제 표시 */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">문제</h2>
          <p className="text-lg text-gray-700 mb-8">{question.questionText}</p>
          {question.imageUrl && (
            <div className="mb-8">
              <img
                src={question.imageUrl}
                alt="문제 이미지"
                className="max-w-[50%] h-auto max-h-[200px] rounded-lg border border-gray-300 object-contain"
              />
            </div>
          )}
          
          {isCompleted ? (
            <div className="space-y-4">
              <div className="bg-green-100 text-green-800 p-6 rounded-lg text-center">
                <p className="text-2xl font-semibold mb-2">미션이 완료되었습니다.</p>
                <p className="text-lg">+{question.score}점을 획득하셨습니다.</p>
              </div>
              
              {/* 학생이 작성한 풀이 내용 */}
              {(studentSolution || savedImageUrl) && (
                <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">내가 작성한 풀이</h3>
                  {studentSolution && (
                    <div className="bg-white p-4 rounded-lg mb-3">
                      <p className="text-gray-700 whitespace-pre-wrap">{studentSolution}</p>
                    </div>
                  )}
                  {savedImageUrl && (
                    <div className="bg-white p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">풀이 사진</p>
                      <img
                        src={savedImageUrl}
                        alt="제출한 풀이 사진"
                        className="max-w-full h-auto rounded-lg border border-gray-300"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* AI 피드백 */}
              {isGeneratingFeedback && (
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg">
                  <p className="font-semibold">🤖 AI 피드백 생성 중...</p>
                </div>
              )}
              {aiFeedback && !isGeneratingFeedback && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 p-6 rounded-lg">
                  <h3 className="text-xl font-bold text-purple-800 mb-3">🤖 AI 선생님의 한마디</h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{aiFeedback}</p>
                </div>
              )}
            </div>
          ) : !isSubmitted ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  작성자 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => {
                    setStudentName(e.target.value);
                  }}
                  placeholder="이름을 입력하세요"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  서술형 풀이
                </label>
                <textarea
                  value={studentSolution}
                  onChange={(e) => setStudentSolution(e.target.value)}
                  placeholder="풀이 과정을 글로 적거나 사진을 찍어주세요"
                  rows={5}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  풀이 사진 업로드
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isCompressingImage || uploading}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {isCompressingImage && (
                  <p className="text-sm text-blue-600 mt-2">📷 이미지 압축 중...</p>
                )}
                {imagePreview && (
                  <div className="mt-3">
                    <img
                      src={imagePreview}
                      alt="미리보기"
                      className="max-w-full h-auto max-h-64 rounded-lg border border-gray-300 object-contain"
                    />
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setSelectedImage(null);
                        setImagePreview(null);
                        // 파일 input 초기화
                        const fileInput = document.querySelector('input[type="file"]');
                        if (fileInput) fileInput.value = '';
                      }}
                      className="mt-2 text-sm text-red-600 hover:text-red-700"
                    >
                      사진 제거
                    </button>
                  </div>
                )}
              </div>
              
              <div className="border-t-2 border-gray-300 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  정답 입력
                </label>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="답안을 입력하세요"
                  disabled={!!statusMessage}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    handleSubmit();
                  }
                }}
              />
              </div>
              
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || !studentName.trim() || !!statusMessage || uploading}
                className={`w-full text-white font-semibold py-3 rounded-lg transition-colors text-lg ${
                  canSubmit && studentName.trim() && !statusMessage && !uploading
                    ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {uploading ? '업로드 및 분석 중...' : (statusMessage || '제출하기')}
              </button>
              {lastSubmittedAnswer && userAnswer.trim() === lastSubmittedAnswer && (
                <p className="text-sm text-gray-500 text-center">
                  답안을 수정한 후 다시 제출해주세요.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 결과 메시지 */}
              <div
                className={`p-4 rounded-lg text-center ${
                  result?.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                <p className="text-xl font-semibold">{result?.message}</p>
              </div>
              
              {/* 학생이 작성한 풀이 내용 */}
              {(studentSolution || savedImageUrl) && (
                <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">내가 작성한 풀이</h3>
                  {studentSolution && (
                    <div className="bg-white p-4 rounded-lg mb-3">
                      <p className="text-gray-700 whitespace-pre-wrap">{studentSolution}</p>
                    </div>
                  )}
                  {savedImageUrl && (
                    <div className="bg-white p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">풀이 사진</p>
                      <img
                        src={savedImageUrl}
                        alt="제출한 풀이 사진"
                        className="max-w-full h-auto rounded-lg border border-gray-300"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* AI 피드백 */}
              {isGeneratingFeedback && (
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg">
                  <p className="font-semibold">🤖 AI 피드백 생성 중...</p>
                </div>
              )}
              {aiFeedback && !isGeneratingFeedback && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 p-6 rounded-lg">
                  <h3 className="text-xl font-bold text-purple-800 mb-3">🤖 AI 선생님의 한마디</h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{aiFeedback}</p>
                </div>
              )}
              
              {/* 오답인 경우 정답 다시 제출 버튼 */}
              {!isCompleted && (
                <button
                  onClick={() => {
                    // 제출 상태 초기화하여 다시 입력할 수 있게 함
                    setIsSubmitted(false);
                    setResult(null);
                    // 학생 이름은 빈 칸으로 초기화
                    setStudentName('');
                    // 풀이와 정답은 유지 (수정 가능하도록)
                  }}
                  className="w-full mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  정답 다시 제출
                </button>
              )}
            </div>
          )}

          {/* 결과 표시 */}
          {result && !isSubmitted && (
            <div className="mt-4">
              <div
                className={`p-4 rounded-lg ${
                  result.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                <p className="font-semibold">{result.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 조커 퇴출 모달 */}
      {showJokerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              퇴출시킬 시민 팀 구성원의 이름은?
            </h3>
            <input
              type="text"
              value={jokerStudentName}
              onChange={(e) => setJokerStudentName(e.target.value)}
              placeholder="학생 이름 입력"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleJokerElimination();
                }
              }}
            />
            <div className="flex gap-4">
              <button
                onClick={handleJokerElimination}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                전송
              </button>
              <button
                onClick={() => {
                  setShowJokerModal(false);
                  setJokerStudentName('');
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

