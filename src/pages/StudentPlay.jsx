// StudentPlay.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  getDocs,
  collection,
  updateDoc,
  addDoc,
  increment,
  runTransaction
} from 'firebase/firestore';
import { checkAnswer } from '../utils/answerChecker';

export default function StudentPlay() {
  const { activityId, teamId, questionId } = useParams();
  const [question, setQuestion] = useState(null);
  const [team, setTeam] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // 제출 중인지 확인
  const [isCompleted, setIsCompleted] = useState(false); // 이미 완료된 문제인지 확인
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState(''); // 마지막으로 제출한 답안
  const [result, setResult] = useState(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showJokerModal, setShowJokerModal] = useState(false);
  const [jokerStudentName, setJokerStudentName] = useState('');

  // 문제 및 팀 정보 로드
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

  // 정답 제출
  const handleSubmit = async () => {
    // 제출 중이거나, 이미 완료되었거나, 답안이 비어있거나, 마지막 제출한 답안과 같으면 제출 불가
    if (!question || !team || isSubmitting || isCompleted || !userAnswer.trim()) {
      return;
    }

    // 마지막으로 제출한 답안과 같으면 제출 불가
    if (lastSubmittedAnswer === userAnswer.trim()) {
      return;
    }

    setIsSubmitting(true);
    const isCorrect = checkAnswer(userAnswer, question.answer);
    
    try {
      const activityRef = doc(db, 'activities', activityId);
      const teamRef = doc(activityRef, 'teams', teamId);

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
        // 재시도 가능하도록 isSubmitted는 false 유지
      }
    } catch (error) {
      console.error('점수 업데이트 오류:', error);
      alert('점수 업데이트에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 답안이 변경되었는지 확인 (제출 버튼 활성화 여부)
  const canSubmit = !isSubmitting && !isCompleted && userAnswer.trim() && userAnswer.trim() !== lastSubmittedAnswer;

  // 조커 퇴출 처리
  const handleJokerElimination = async () => {
    if (!jokerStudentName.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    try {
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

      // 알림 추가 (activityId 포함)
      await addDoc(collection(db, 'notifications'), {
        text: `${jokerStudentName} 학생이 퇴출되었습니다!`,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* 점수 표시 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="text-center">
            <p className="text-gray-600 mb-2">현재 점수</p>
            <p className="text-4xl font-bold text-blue-600">{currentScore}점</p>
          </div>
        </div>

        {/* 문제 표시 */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">문제</h2>
          <p className="text-lg text-gray-700 mb-8">{question.questionText}</p>
          
          {isCompleted ? (
            <div className="text-center">
              <div className="bg-green-100 text-green-800 p-6 rounded-lg">
                <p className="text-2xl font-semibold mb-2">미션이 완료되었습니다.</p>
                <p className="text-lg">+{question.score}점을 획득하셨습니다.</p>
              </div>
            </div>
          ) : !isSubmitted ? (
            <div className="space-y-4">
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="답안을 입력하세요"
                disabled={isSubmitting}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    handleSubmit();
                  }
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-full text-white font-semibold py-3 rounded-lg transition-colors text-lg ${
                  canSubmit
                    ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? '제출 중...' : '제출'}
              </button>
              {lastSubmittedAnswer && userAnswer.trim() === lastSubmittedAnswer && (
                <p className="text-sm text-gray-500 text-center">
                  답안을 수정한 후 다시 제출해주세요.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center">
              <div
                className={`p-4 rounded-lg ${
                  result?.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                <p className="text-xl font-semibold">{result?.message}</p>
              </div>
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

