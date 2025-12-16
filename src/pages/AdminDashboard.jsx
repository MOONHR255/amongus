// AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  getDocs,
  getDoc,
  deleteDoc, 
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  increment,
  writeBatch,
  where
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import QRCodeSVG from 'react-qr-code';
import { X, AlertCircle, Edit2, Trash2 } from 'lucide-react';

const ADMIN_PASSWORD = 'admin123';

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [teams, setTeams] = useState([]);
  const [questions, setQuestions] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [eliminatedList, setEliminatedList] = useState([]); // 퇴출자 명단
  const [activeNotifications, setActiveNotifications] = useState([]); // 현재 표시 중인 알림
  
  // 폼 상태
  const [newActivityName, setNewActivityName] = useState('');
  const [newActivityEducationalContext, setNewActivityEducationalContext] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState('citizen');
  const [newTeamMemberCount, setNewTeamMemberCount] = useState(1); // 팀 인원수
  const [selectedTeamForQuestion, setSelectedTeamForQuestion] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionAnswer, setNewQuestionAnswer] = useState('');
  const [newQuestionScore, setNewQuestionScore] = useState(10);
  const [newQuestionEducationalContext, setNewQuestionEducationalContext] = useState('');
  const [newQuestionImageUrl, setNewQuestionImageUrl] = useState(''); // 문제 이미지 URL
  const [newQuestionImageFile, setNewQuestionImageFile] = useState(null); // 문제 이미지 파일
  const [newQuestionImagePreview, setNewQuestionImagePreview] = useState(null); // 문제 이미지 미리보기
  const [isUploadingQuestionImage, setIsUploadingQuestionImage] = useState(false); // 이미지 업로드 중
  const [generatedAccessCodes, setGeneratedAccessCodes] = useState({}); // 생성된 고유번호 저장 {teamId: [codes]}
  const [submissions, setSubmissions] = useState([]);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions', 'monitoring', 'statistics'
  const [selectedStudentStat, setSelectedStudentStat] = useState(null); // { studentName: string, type: 'correct' | 'incorrect' }
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // 보안 경보 시스템 상태
  const [alertThreshold, setAlertThreshold] = useState(-5); // 기준 점수
  const [showSecurityAlert, setShowSecurityAlert] = useState(false); // 경보 배너 표시 여부
  
  // 문항별 분석 상태
  const [statisticsSubTab, setStatisticsSubTab] = useState('students'); // 'students' | 'questions'
  const [questionAnalysisSortOrder, setQuestionAnalysisSortOrder] = useState('asc'); // 'asc' (낮은 순) | 'desc' (높은 순)

  // 로그인 처리
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPassword('');
      // 로그인 상태를 localStorage에 저장
      localStorage.setItem('adminAuthenticated', 'true');
    } else {
      alert('비밀번호가 올바르지 않습니다.');
    }
  };

  // 로그아웃 처리
  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('adminAuthenticated');
  };

  // 컴포넌트 마운트 시 로그인 상태 복구
  useEffect(() => {
    const savedAuth = localStorage.getItem('adminAuthenticated');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // 활동 생성
  const handleCreateActivity = async () => {
    if (!newActivityName.trim()) return;
    
    try {
      const activityData = {
        name: newActivityName,
        createdAt: new Date()
      };
      
      if (newActivityEducationalContext.trim()) {
        activityData.educationalContext = newActivityEducationalContext.trim();
      }
      
      await addDoc(collection(db, 'activities'), activityData);
      setNewActivityName('');
      setNewActivityEducationalContext('');
      loadActivities();
    } catch (error) {
      console.error('활동 생성 오류:', error);
      alert('활동 생성에 실패했습니다.');
    }
  };

  // 활동 목록 로드
  const loadActivities = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'activities'), orderBy('createdAt', 'asc')));
      const activitiesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setActivities(activitiesList);
    } catch (error) {
      console.error('활동 목록 로드 오류:', error);
    }
  };

  // 활동 이름 수정
  const handleUpdateActivity = async (activityId, newName) => {
    if (!newName.trim()) {
      alert('활동 이름을 입력해주세요.');
      return;
    }
    
    try {
      const activityRef = doc(db, 'activities', activityId);
      await updateDoc(activityRef, {
        name: newName.trim()
      });
      loadActivities();
      
      // 현재 선택된 활동이 수정된 경우 선택 상태 유지
      if (selectedActivity === activityId) {
        // 선택 상태는 그대로 유지됨
      }
    } catch (error) {
      console.error('활동 수정 오류:', error);
      alert('활동 수정에 실패했습니다.');
    }
  };

  // 활동 삭제
  const handleDeleteActivity = async (activityId) => {
    if (!confirm('정말 이 활동을 삭제하시겠습니까?\n모든 팀과 문제가 함께 삭제됩니다.')) {
      return;
    }
    
    try {
      const activityRef = doc(db, 'activities', activityId);
      
      // 하위 컬렉션(teams)도 함께 삭제
      const teamsSnapshot = await getDocs(collection(activityRef, 'teams'));
      
      // 각 팀의 하위 컬렉션(questions)도 삭제
      const batch = writeBatch(db);
      
      for (const teamDoc of teamsSnapshot.docs) {
        const teamRef = doc(activityRef, 'teams', teamDoc.id);
        const questionsSnapshot = await getDocs(collection(teamRef, 'questions'));
        
        // 각 문제 삭제
        questionsSnapshot.docs.forEach(questionDoc => {
          batch.delete(doc(teamRef, 'questions', questionDoc.id));
        });
        
        // 팀 삭제
        batch.delete(teamRef);
      }
      
      // 활동 삭제
      batch.delete(activityRef);
      
      await batch.commit();
      
      // 삭제된 활동이 선택되어 있었다면 선택 해제
      if (selectedActivity === activityId) {
        setSelectedActivity(null);
        setTeams([]);
        setQuestions({});
      }
      
      loadActivities();
      alert('활동이 삭제되었습니다.');
    } catch (error) {
      console.error('활동 삭제 오류:', error);
      alert('활동 삭제에 실패했습니다.');
    }
  };

  // 3자리 고유번호 생성 함수
  const generateUniqueCode = () => {
    // 100~999 사이의 랜덤 숫자 생성
    return Math.floor(100 + Math.random() * 900).toString();
  };

  // 팀 추가 (고유번호 생성 포함)
  const handleAddTeam = async () => {
    if (!selectedActivity || !newTeamName.trim()) return;
    if (newTeamMemberCount < 1 || newTeamMemberCount > 100) {
      alert('인원수는 1명 이상 100명 이하로 입력해주세요.');
      return;
    }
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      
      // 중복 이름 체크
      const existingTeamsSnapshot = await getDocs(collection(activityRef, 'teams'));
      const existingTeamNames = existingTeamsSnapshot.docs.map(doc => doc.data().name);
      if (existingTeamNames.includes(newTeamName.trim())) {
        alert('동일한 이름의 팀이 이미 존재합니다.');
        return;
      }
      
      // 팀 생성
      const teamRef = await addDoc(collection(activityRef, 'teams'), {
        name: newTeamName,
        type: newTeamType,
        score: 0,
        memberCount: newTeamMemberCount
      });
      
      // 고유번호 생성 및 저장
      const accessCodes = [];
      const usedCodes = new Set();
      
      // 인원수만큼 고유번호 생성
      for (let i = 0; i < newTeamMemberCount; i++) {
        let code;
        let attempts = 0;
        
        // 중복되지 않는 번호 생성 (최대 1000번 시도)
        do {
          code = generateUniqueCode();
          attempts++;
          if (attempts > 1000) {
            alert('고유번호 생성에 실패했습니다. 다시 시도해주세요.');
            return;
          }
        } while (usedCodes.has(code));
        
        usedCodes.add(code);
        accessCodes.push(code);
        
        // access_codes 컬렉션에 저장
        await addDoc(collection(teamRef, 'access_codes'), {
          code: code,
          is_used: false,
          team_id: teamRef.id,
          createdAt: new Date()
        });
      }
      
      // 생성된 고유번호를 상태에 저장 (화면 표시용)
      setGeneratedAccessCodes(prev => ({
        ...prev,
        [teamRef.id]: accessCodes
      }));
      
      setNewTeamName('');
      setNewTeamMemberCount(1);
      loadTeams();
      
      // 생성 완료 알림
      alert(`${newTeamName} 팀이 생성되었습니다.\n생성된 고유번호: ${accessCodes.join(', ')}`);
    } catch (error) {
      console.error('팀 추가 오류:', error);
      alert('팀 추가에 실패했습니다.');
    }
  };

  // 팀 삭제
  const handleDeleteTeam = async (teamId) => {
    if (!selectedActivity) return;
    
    if (!confirm('정말 이 팀을 삭제하시겠습니까?\n팀의 모든 문제와 고유번호가 함께 삭제됩니다.')) {
      return;
    }
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', teamId);
      
      // 팀의 하위 컬렉션 삭제
      const batch = writeBatch(db);
      
      // 문제 삭제
      const questionsSnapshot = await getDocs(collection(teamRef, 'questions'));
      questionsSnapshot.docs.forEach(questionDoc => {
        batch.delete(doc(teamRef, 'questions', questionDoc.id));
      });
      
      // 고유번호 삭제
      const accessCodesSnapshot = await getDocs(collection(teamRef, 'access_codes'));
      accessCodesSnapshot.docs.forEach(accessCodeDoc => {
        batch.delete(doc(teamRef, 'access_codes', accessCodeDoc.id));
      });
      
      // 팀 삭제
      batch.delete(teamRef);
      
      await batch.commit();
      
      loadTeams();
      alert('팀이 삭제되었습니다.');
    } catch (error) {
      console.error('팀 삭제 오류:', error);
      alert('팀 삭제에 실패했습니다.');
    }
  };

  // 팀 이름 수정
  const handleUpdateTeamName = async (teamId, newName) => {
    if (!selectedActivity || !newName.trim()) {
      alert('팀 이름을 입력해주세요.');
      return;
    }
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      
      // 중복 이름 체크 (현재 팀 제외)
      const existingTeamsSnapshot = await getDocs(collection(activityRef, 'teams'));
      const existingTeamNames = existingTeamsSnapshot.docs
        .filter(doc => doc.id !== teamId)
        .map(doc => doc.data().name);
      
      if (existingTeamNames.includes(newName.trim())) {
        alert('동일한 이름의 팀이 이미 존재합니다.');
        return;
      }
      
      const teamRef = doc(activityRef, 'teams', teamId);
      await updateDoc(teamRef, {
        name: newName.trim()
      });
      
      loadTeams();
    } catch (error) {
      console.error('팀 이름 수정 오류:', error);
      alert('팀 이름 수정에 실패했습니다.');
    }
  };

  // 팀 인원수 수정 (고유번호 추가/삭제)
  const handleUpdateTeamMemberCount = async (teamId, newMemberCount) => {
    if (!selectedActivity) return;
    if (newMemberCount < 1 || newMemberCount > 100) {
      alert('인원수는 1명 이상 100명 이하로 입력해주세요.');
      return;
    }
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', teamId);
      
      // 현재 팀 정보 가져오기
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) {
        alert('팀을 찾을 수 없습니다.');
        return;
      }
      
      const currentMemberCount = teamSnap.data().memberCount || 0;
      const difference = newMemberCount - currentMemberCount;
      
      if (difference > 0) {
        // 인원수 증가: 고유번호 추가 생성
        const accessCodes = [];
        const usedCodes = new Set();
        
        // 기존 고유번호 가져오기 (중복 방지)
        const existingCodesSnapshot = await getDocs(collection(teamRef, 'access_codes'));
        existingCodesSnapshot.docs.forEach(doc => {
          usedCodes.add(doc.data().code);
        });
        
        // 추가 인원수만큼 고유번호 생성
        for (let i = 0; i < difference; i++) {
          let code;
          let attempts = 0;
          
          do {
            code = generateUniqueCode();
            attempts++;
            if (attempts > 1000) {
              alert('고유번호 생성에 실패했습니다. 다시 시도해주세요.');
              return;
            }
          } while (usedCodes.has(code));
          
          usedCodes.add(code);
          accessCodes.push(code);
          
          await addDoc(collection(teamRef, 'access_codes'), {
            code: code,
            is_used: false,
            team_id: teamId,
            createdAt: new Date()
          });
        }
        
        // 팀 정보 업데이트
        await updateDoc(teamRef, {
          memberCount: newMemberCount
        });
        
        alert(`${difference}개의 고유번호가 추가되었습니다.\n추가된 고유번호: ${accessCodes.join(', ')}`);
      } else if (difference < 0) {
        // 인원수 감소: 사용되지 않은 고유번호부터 삭제
        const unusedCodesSnapshot = await getDocs(
          query(
            collection(teamRef, 'access_codes'),
            where('is_used', '==', false)
          )
        );
        
        const codesToDelete = Math.min(Math.abs(difference), unusedCodesSnapshot.docs.length);
        
        if (codesToDelete < Math.abs(difference)) {
          alert(`사용되지 않은 고유번호가 ${codesToDelete}개만 있어서 ${codesToDelete}개만 삭제됩니다.`);
        }
        
        const batch = writeBatch(db);
        for (let i = 0; i < codesToDelete; i++) {
          batch.delete(unusedCodesSnapshot.docs[i].ref);
        }
        await batch.commit();
        
        // 팀 정보 업데이트
        await updateDoc(teamRef, {
          memberCount: newMemberCount
        });
        
        alert(`${codesToDelete}개의 미사용 고유번호가 삭제되었습니다.`);
      }
      
      loadTeams();
    } catch (error) {
      console.error('팀 인원수 수정 오류:', error);
      alert('팀 인원수 수정에 실패했습니다.');
    }
  };

  // 팀 목록 로드 (고유번호 포함)
  const loadTeams = async () => {
    if (!selectedActivity) return;
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const snapshot = await getDocs(collection(activityRef, 'teams'));
      const teamsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTeams(teamsList);
      
      // 각 팀의 고유번호도 로드
      const accessCodesMap = {};
      for (const team of teamsList) {
        const teamRef = doc(activityRef, 'teams', team.id);
        const accessCodesSnapshot = await getDocs(collection(teamRef, 'access_codes'));
        const codes = accessCodesSnapshot.docs.map(doc => doc.data().code);
        if (codes.length > 0) {
          accessCodesMap[team.id] = codes;
        }
      }
      setGeneratedAccessCodes(prev => ({ ...prev, ...accessCodesMap }));
      
      // 각 팀의 문제 목록도 로드 (정렬 포함)
      const questionsMap = {};
      for (const team of teamsList) {
        const teamRef = doc(activityRef, 'teams', team.id);
        try {
          const questionsSnapshot = await getDocs(query(collection(teamRef, 'questions'), orderBy('createdAt', 'asc')));
          questionsMap[team.id] = questionsSnapshot.docs.map(qDoc => ({
            id: qDoc.id,
            ...qDoc.data()
          }));
        } catch (error) {
          // createdAt 필드가 없는 경우 정렬 없이 로드
          console.warn('문제 목록 정렬 실패, createdAt 필드가 없을 수 있습니다:', error);
          const questionsSnapshot = await getDocs(collection(teamRef, 'questions'));
          questionsMap[team.id] = questionsSnapshot.docs.map(qDoc => ({
            id: qDoc.id,
            ...qDoc.data()
          }));
        }
      }
      setQuestions(questionsMap);
    } catch (error) {
      console.error('팀 목록 로드 오류:', error);
    }
  };

  // 문제 이미지 파일 선택 핸들러
  const handleQuestionImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setNewQuestionImageFile(null);
      setNewQuestionImagePreview(null);
      setNewQuestionImageUrl('');
      return;
    }

    try {
      setIsUploadingQuestionImage(true);
      
      // 이미지 크기 조정 (작성자 이름 입력 칸의 절반 크기 이하로 제한)
      // 작성자 이름 입력 칸은 보통 전체 너비이므로, 이미지는 최대 400px로 제한
      const options = {
        maxSizeMB: 0.5, // 최대 500KB
        maxWidthOrHeight: 400, // 최대 400px (작성자 이름 입력 칸의 절반 정도)
        useWebWorker: true
      };
      
      const compressedFile = await imageCompression(file, options);
      setNewQuestionImageFile(compressedFile);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewQuestionImagePreview(reader.result);
        setIsUploadingQuestionImage(false);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('이미지 압축 오류:', error);
      alert('이미지 처리에 실패했습니다.');
      setIsUploadingQuestionImage(false);
      setNewQuestionImageFile(null);
      setNewQuestionImagePreview(null);
    }
  };

  // 문제 추가
  const handleAddQuestion = async () => {
    if (!selectedActivity || !selectedTeamForQuestion || !newQuestionText.trim() || !newQuestionAnswer.trim()) return;
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', selectedTeamForQuestion);
      
      let imageUrl = newQuestionImageUrl.trim();
      
      // 이미지 파일이 있으면 업로드
      if (newQuestionImageFile) {
        setIsUploadingQuestionImage(true);
        try {
          // Firebase Storage에 업로드
          const storageRef = ref(storage, `questions/${selectedActivity}/${selectedTeamForQuestion}/${Date.now()}_${newQuestionImageFile.name}`);
          await uploadBytes(storageRef, newQuestionImageFile);
          
          // 다운로드 URL 가져오기
          imageUrl = await getDownloadURL(storageRef);
          console.log('문제 이미지 업로드 성공:', imageUrl);
        } catch (uploadError) {
          console.error('이미지 업로드 오류:', uploadError);
          alert('이미지 업로드에 실패했습니다. 이미지 없이 문제를 추가합니다.');
          imageUrl = '';
        } finally {
          setIsUploadingQuestionImage(false);
        }
      }
      
      const questionData = {
        questionText: newQuestionText,
        answer: newQuestionAnswer,
        score: parseInt(newQuestionScore),
        createdAt: new Date()
      };
      
      if (newQuestionEducationalContext.trim()) {
        questionData.educationalContext = newQuestionEducationalContext.trim();
      }
      
      if (imageUrl) {
        questionData.imageUrl = imageUrl;
      }
      
      const docRef = await addDoc(collection(teamRef, 'questions'), questionData);
      
      // questionId 필드에 문서 ID 저장
      await updateDoc(docRef, {
        questionId: docRef.id
      });
      
      setNewQuestionText('');
      setNewQuestionAnswer('');
      setNewQuestionScore(10);
      setNewQuestionEducationalContext('');
      setNewQuestionImageUrl('');
      setNewQuestionImageFile(null);
      setNewQuestionImagePreview(null);
      
      // 파일 input 초기화
      const fileInput = document.querySelector('input[type="file"][accept="image/*"]');
      if (fileInput) fileInput.value = '';
      
      loadTeams();
    } catch (error) {
      console.error('문제 추가 오류:', error);
      alert('문제 추가에 실패했습니다.');
      setIsUploadingQuestionImage(false);
    }
  };

  // 문제 삭제
  const handleDeleteQuestion = async (teamId, questionId) => {
    if (!selectedActivity) return;
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', teamId);
      await deleteDoc(doc(teamRef, 'questions', questionId));
      loadTeams();
    } catch (error) {
      console.error('문제 삭제 오류:', error);
      alert('문제 삭제에 실패했습니다.');
    }
  };

  // 문제 이미지 업로드 및 수정
  const handleUpdateQuestionImage = async (teamId, questionId, file) => {
    if (!selectedActivity || !file) return;
    
    try {
      setIsUploadingQuestionImage(true);
      
      // 이미지 크기 조정
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 400,
        useWebWorker: true
      };
      
      const compressedFile = await imageCompression(file, options);
      
      // Firebase Storage에 업로드
      const storageRef = ref(storage, `questions/${selectedActivity}/${teamId}/${Date.now()}_${compressedFile.name}`);
      await uploadBytes(storageRef, compressedFile);
      
      // 다운로드 URL 가져오기
      const imageUrl = await getDownloadURL(storageRef);
      
      // 문제 데이터 업데이트
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', teamId);
      await updateDoc(doc(teamRef, 'questions', questionId), {
        imageUrl: imageUrl
      });
      
      loadTeams();
      alert('이미지가 업로드되었습니다.');
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setIsUploadingQuestionImage(false);
    }
  };

  // 문제 수정
  const handleUpdateQuestion = async (teamId, questionId, field, value) => {
    if (!selectedActivity) return;
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', teamId);
      await updateDoc(doc(teamRef, 'questions', questionId), {
        [field]: value
      });
      loadTeams();
    } catch (error) {
      console.error('문제 수정 오류:', error);
    }
  };

  // 활동 선택 시
  useEffect(() => {
    if (selectedActivity) {
      loadTeams();
      setActiveTab('questions'); // 활동 선택 시 기본 탭으로 리셋
      
      // 실시간 팀 점수 감시
      const activityRef = doc(db, 'activities', selectedActivity);
      const unsubscribe = onSnapshot(
        collection(activityRef, 'teams'),
        (snapshot) => {
          const teamsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setTeams(teamsList);
        }
      );
      
      // 활동이 변경되면 활성 알림 초기화 및 해당 활동의 퇴출자만 필터링
      setActiveNotifications([]);
      
      return () => unsubscribe();
    } else {
      // 활동이 선택되지 않으면 알림 초기화
      setActiveNotifications([]);
    }
  }, [selectedActivity]);

  // 알림 실시간 감시
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'notifications'), orderBy('timestamp', 'desc')),
      (snapshot) => {
        const newNotifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setNotifications(newNotifications);
      }
    );
    
    return () => unsubscribe();
  }, []);

  // 새로운 알림 처리 및 30초 타이머
  useEffect(() => {
    const timers = [];
    
    // 활동이 선택되지 않았으면 알림 처리하지 않음
    if (!selectedActivity) {
      setActiveNotifications([]);
      return;
    }
    
    notifications.forEach((notif) => {
      // 퇴출 알림이고, 현재 선택된 활동과 일치하는지 확인
      if (notif.text && notif.text.includes('퇴출') && notif.activityId === selectedActivity) {
        // 알림의 timestamp 확인
        let notifTime = null;
        if (notif.timestamp?.toDate) {
          notifTime = notif.timestamp.toDate().getTime();
        } else if (notif.timestamp?.seconds) {
          notifTime = notif.timestamp.seconds * 1000;
        } else if (notif.timestamp instanceof Date) {
          notifTime = notif.timestamp.getTime();
        }
        
        const now = Date.now();
        const timeDiff = notifTime ? now - notifTime : 0; // 밀리초 단위
        
        // 이미 활성 알림에 있는지 확인
        setActiveNotifications(prev => {
          const isAlreadyActive = prev.some(n => n.id === notif.id);
          if (!isAlreadyActive) {
            // 30초(30000ms)가 지난 알림은 바로 퇴출자 명단에 추가
            if (timeDiff >= 30000) {
              // 퇴출자 명단에 바로 추가 (현재 활동의 알림만)
              if (notif.activityId === selectedActivity) {
                setEliminatedList(current => {
                  // 새로운 포맷: ['활동명'] 의 '사용자명' 퇴출
                  // 기존 포맷: 사용자명 학생이 퇴출되었습니다!
                  let studentName = '';
                  if (notif.text.includes("'") && notif.text.includes('퇴출')) {
                    // 새 포맷 파싱
                    const match = notif.text.match(/'([^']+)' 퇴출/);
                    studentName = match ? match[1] : notif.text.replace(' 학생이 퇴출되었습니다!', '').trim();
                  } else {
                    // 기존 포맷 파싱 (하위 호환성)
                    studentName = notif.text.replace(' 학생이 퇴출되었습니다!', '').trim();
                  }
                  const isDuplicate = current.some(item => {
                    const itemTime = item.timestamp?.seconds || (item.timestamp?.toDate ? item.timestamp.toDate().getTime() : 0);
                    const notifTimeValue = notif.timestamp?.seconds || (notif.timestamp?.toDate ? notif.timestamp.toDate().getTime() : 0);
                    return item.name === studentName && itemTime === notifTimeValue;
                  });
                  if (!isDuplicate) {
                    return [...current, {
                      name: studentName,
                      timestamp: notif.timestamp,
                      id: notif.id,
                      activityId: notif.activityId
                    }];
                  }
                  return current;
                });
              }
              return prev; // 활성 알림에는 추가하지 않음
            }
            
            // 30초가 지나지 않은 경우, 남은 시간만큼 타이머 설정
            const remainingTime = 30000 - timeDiff;
            const timer = setTimeout(() => {
              setActiveNotifications(current => current.filter(n => n.id !== notif.id));
              
              // 퇴출자 명단에 추가 (중복 방지, 현재 활동의 알림만)
              if (notif.activityId === selectedActivity) {
                setEliminatedList(current => {
                  // 새로운 포맷: ['활동명'] 의 '사용자명' 퇴출
                  // 기존 포맷: 사용자명 학생이 퇴출되었습니다!
                  let studentName = '';
                  if (notif.text.includes("'") && notif.text.includes('퇴출')) {
                    // 새 포맷 파싱
                    const match = notif.text.match(/'([^']+)' 퇴출/);
                    studentName = match ? match[1] : notif.text.replace(' 학생이 퇴출되었습니다!', '').trim();
                  } else {
                    // 기존 포맷 파싱 (하위 호환성)
                    studentName = notif.text.replace(' 학생이 퇴출되었습니다!', '').trim();
                  }
                  const isDuplicate = current.some(item => {
                    const itemTime = item.timestamp?.seconds || (item.timestamp?.toDate ? item.timestamp.toDate().getTime() : 0);
                    const notifTimeValue = notif.timestamp?.seconds || (notif.timestamp?.toDate ? notif.timestamp.toDate().getTime() : 0);
                    return item.name === studentName && itemTime === notifTimeValue;
                  });
                  if (!isDuplicate) {
                    return [...current, {
                      name: studentName,
                      timestamp: notif.timestamp,
                      id: notif.id,
                      activityId: notif.activityId
                    }];
                  }
                  return current;
                });
              }
            }, remainingTime);
            
            timers.push(timer);
            return [...prev, notif];
          }
          return prev;
        });
      }
    });
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [notifications, selectedActivity]);

  // 활동 목록 로드
  useEffect(() => {
    if (isAuthenticated) {
      loadActivities();
    }
  }, [isAuthenticated]);

  // submissions 컬렉션 실시간 감시 (안전한 정렬)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'submissions'), orderBy('submittedAt', 'desc')),
      (snapshot) => {
        const submissionsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // createdAt이 있으면 createdAt 기준으로, 없으면 submittedAt 기준으로 정렬
        const sortedSubmissions = submissionsList.sort((a, b) => {
          let timeA = 0;
          let timeB = 0;
          
          // createdAt 또는 submittedAt 중 사용 가능한 것 사용
          if (a.createdAt?.toDate) {
            timeA = a.createdAt.toDate().getTime();
          } else if (a.submittedAt?.toDate) {
            timeA = a.submittedAt.toDate().getTime();
          } else if (a.createdAt?.seconds) {
            timeA = a.createdAt.seconds * 1000;
          } else if (a.submittedAt?.seconds) {
            timeA = a.submittedAt.seconds * 1000;
          }
          
          if (b.createdAt?.toDate) {
            timeB = b.createdAt.toDate().getTime();
          } else if (b.submittedAt?.toDate) {
            timeB = b.submittedAt.toDate().getTime();
          } else if (b.createdAt?.seconds) {
            timeB = b.createdAt.seconds * 1000;
          } else if (b.submittedAt?.seconds) {
            timeB = b.submittedAt.seconds * 1000;
          }
          
          return timeB - timeA; // 내림차순 (최신이 먼저)
        });
        
        setSubmissions(sortedSubmissions);
      },
      (error) => {
        console.error('submissions 실시간 감시 오류:', error);
        // 에러 발생 시 빈 배열로 설정
        setSubmissions([]);
      }
    );
    
    return () => unsubscribe();
  }, []);

  // 조커 팀 점수 합계 계산 및 경보 감지
  useEffect(() => {
    if (!selectedActivity) {
      setShowSecurityAlert(false);
      return;
    }

    // 조커 팀의 점수 합계 계산
    const jokerTeams = teams.filter(team => team.type === 'joker');
    const totalJokerScore = jokerTeams.reduce((sum, team) => sum + (team.score || 0), 0);

    // 기준 점수 이하일 때 경보 표시
    if (totalJokerScore <= alertThreshold) {
      setShowSecurityAlert(true);
    } else {
      // 기준 점수보다 높아지면 경보는 자동으로 사라지지 않음 (확인 버튼으로만 닫기)
      // setShowSecurityAlert(false);
    }
  }, [teams, alertThreshold, selectedActivity]);

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">관리자 로그인</h2>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-100 p-6 ${showSecurityAlert && selectedActivity ? 'pt-24' : ''}`}>
      {/* 보안 경보 배너 */}
      {showSecurityAlert && selectedActivity && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-red-600 text-white px-6 py-4 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 animate-pulse" />
              <p className="text-lg font-semibold">
                🚨 보안 시스템 작동! 누군가가 우주선을 망가트리고 있습니다. 그 사람에 대한 정보가 제공됩니다.
              </p>
            </div>
            <button
              onClick={() => setShowSecurityAlert(false)}
              className="px-4 py-2 bg-white text-red-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 알림 표시 (30초 동안만 표시, 선택된 활동의 알림만) */}
      {selectedActivity && activeNotifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {activeNotifications.slice(0, 3).map((notif) => (
            <div
              key={notif.id}
              className="bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-pulse"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">{notif.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 퇴출자 명단 (선택된 활동의 퇴출자만) */}
      {selectedActivity && eliminatedList.filter(item => item.activityId === selectedActivity).length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 bg-white rounded-lg shadow-xl p-6 max-w-sm max-h-96 overflow-y-auto">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            퇴출자 명단
          </h3>
          <div className="space-y-2">
            {eliminatedList
              .filter(item => item.activityId === selectedActivity)
              .sort((a, b) => {
                const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
                const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
                return timeB - timeA;
              })
              .map((item, index) => (
                <div
                  key={item.id || index}
                  className="p-3 bg-red-50 border-l-4 border-red-600 rounded"
                >
                  <div className="font-semibold text-red-800">{item.name}</div>
                  {item.timestamp?.toDate && (
                    <div className="text-xs text-gray-500 mt-1">
                      {item.timestamp.toDate().toLocaleString('ko-KR')}
                    </div>
                  )}
                </div>
              ))}
          </div>
          {eliminatedList.filter(item => item.activityId === selectedActivity).length > 0 && (
            <button
              onClick={async () => {
                if (confirm('현재 활동의 퇴출자 명단을 모두 삭제하시겠습니까?\nFirestore의 퇴출 알림도 함께 삭제됩니다.')) {
                  try {
                    // Firestore의 notifications 컬렉션에서 해당 활동의 퇴출 알림 삭제
                    const notificationsToDelete = eliminatedList.filter(item => item.activityId === selectedActivity);
                    
                    for (const eliminatedItem of notificationsToDelete) {
                      if (eliminatedItem.id) {
                        try {
                          await deleteDoc(doc(db, 'notifications', eliminatedItem.id));
                        } catch (deleteError) {
                          console.error('알림 삭제 오류:', deleteError);
                        }
                      }
                    }
                    
                    // 로컬 state에서도 제거
                    setEliminatedList(prev => prev.filter(item => item.activityId !== selectedActivity));
                    alert('퇴출자 명단이 초기화되었습니다.');
                  } catch (error) {
                    console.error('명단 초기화 오류:', error);
                    alert('명단 초기화 중 오류가 발생했습니다.');
                  }
                }
              }}
              className="mt-4 w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors text-sm"
            >
              명단 초기화
            </button>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* 모드 A: 활동 목록 화면 (selectedActivity가 null일 때) */}
        {!selectedActivity ? (
          <>
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-4xl font-bold text-gray-800">관리자 대시보드</h1>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                로그아웃
              </button>
            </div>

            {/* 활동 생성 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">활동 생성</h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={newActivityName}
                    onChange={(e) => setNewActivityName(e.target.value)}
                    placeholder="활동 이름"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleCreateActivity}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    활동 생성
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    관련 교과서 핵심 내용 및 성취기준 (선택사항)
                  </label>
                  <textarea
                    value={newActivityEducationalContext}
                    onChange={(e) => setNewActivityEducationalContext(e.target.value)}
                    placeholder="활동과 관련된 교과서 핵심 내용 및 성취기준을 입력하세요"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 활동 목록 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">활동 목록</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="p-4 rounded-lg border-2 border-gray-300 hover:border-gray-400 transition-colors cursor-pointer"
                    onClick={() => setSelectedActivity(activity.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="flex-1 text-left font-semibold text-lg hover:text-blue-600 transition-colors">
                        {activity.name}
                      </h3>
                      <div className="flex gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newName = prompt('활동 이름을 수정하세요:', activity.name);
                            if (newName && newName !== activity.name) {
                              handleUpdateActivity(activity.id, newName);
                            }
                          }}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteActivity(activity.id);
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {activity.createdAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        생성일: {activity.createdAt.toDate ? activity.createdAt.toDate().toLocaleDateString('ko-KR') : '알 수 없음'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* 모드 B: 활동 상세 관리 화면 (selectedActivity가 있을 때) */
          <>
            {/* 뒤로 가기 버튼 및 제목 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setSelectedActivity(null);
                    setActiveTab('questions');
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
                >
                  ← 뒤로 가기
                </button>
                <h1 className="text-4xl font-bold text-gray-800">
                  {activities.find(a => a.id === selectedActivity)?.name || '활동'} 관리 페이지
                </h1>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                로그아웃
              </button>
            </div>

            {/* 탭 메뉴 */}
            <div className="bg-white rounded-lg shadow-md mb-6">
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('questions')}
                  className={`px-6 py-4 font-semibold transition-colors ${
                    activeTab === 'questions'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  문제 관리
                </button>
                <button
                  onClick={() => setActiveTab('monitoring')}
                  className={`px-6 py-4 font-semibold transition-colors ${
                    activeTab === 'monitoring'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  실시간 모니터링
                </button>
                <button
                  onClick={() => setActiveTab('statistics')}
                  className={`px-6 py-4 font-semibold transition-colors ${
                    activeTab === 'statistics'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  학생 통계
                </button>
              </div>
            </div>

            {/* 탭 내용 */}
            {activeTab === 'questions' && (
              <div className="space-y-6">
                {/* 팀 등록 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">팀 등록</h2>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="팀 이름"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={newTeamType}
                      onChange={(e) => setNewTeamType(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="citizen">시민</option>
                      <option value="joker">조커</option>
                    </select>
                    <input
                      type="number"
                      value={newTeamMemberCount}
                      onChange={(e) => setNewTeamMemberCount(parseInt(e.target.value) || 1)}
                      placeholder="인원수"
                      min="1"
                      max="100"
                      className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddTeam}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      팀 추가
                    </button>
                  </div>
                </div>

                {/* 팀 목록 및 관리 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">팀 목록</h2>
                  {teams.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">등록된 팀이 없습니다.</p>
                  ) : (
                    <div className="space-y-4">
                      {teams.map((team) => (
                        <div
                          key={team.id}
                          className="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-semibold text-gray-800">{team.name}</h3>
                                <span
                                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    team.type === 'joker'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {team.type === 'joker' ? '조커' : '시민'}
                                </span>
                                <span className="text-sm text-gray-600">
                                  점수: {team.score || 0}점
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                인원수: {team.memberCount || 0}명
                              </p>
                              {generatedAccessCodes[team.id] && (
                                <div className="mt-2 p-2 bg-gray-50 rounded">
                                  <p className="text-xs text-gray-600 mb-1">생성된 고유번호:</p>
                                  <p className="text-sm font-mono text-gray-800">
                                    {generatedAccessCodes[team.id].join(', ')}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => {
                                  const newName = prompt('팀 이름을 수정하세요:', team.name);
                                  if (newName && newName.trim() !== team.name) {
                                    handleUpdateTeamName(team.id, newName.trim());
                                  }
                                }}
                                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm transition-colors"
                                title="팀 이름 수정"
                              >
                                이름 수정
                              </button>
                              <button
                                onClick={() => {
                                  const newCount = prompt('인원수를 수정하세요:', team.memberCount || 1);
                                  if (newCount) {
                                    const count = parseInt(newCount);
                                    if (!isNaN(count) && count > 0) {
                                      handleUpdateTeamMemberCount(team.id, count);
                                    } else {
                                      alert('올바른 숫자를 입력해주세요.');
                                    }
                                  }
                                }}
                                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm transition-colors"
                                title="인원수 수정"
                              >
                                인원수 수정
                              </button>
                              <button
                                onClick={() => handleDeleteTeam(team.id)}
                                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm transition-colors"
                                title="팀 삭제"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 문제 등록 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">문제 등록</h2>
                  <div className="space-y-4">
                    <select
                      value={selectedTeamForQuestion}
                      onChange={(e) => setSelectedTeamForQuestion(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">팀 선택</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newQuestionText}
                      onChange={(e) => setNewQuestionText(e.target.value)}
                      placeholder="문제 내용"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={newQuestionAnswer}
                      onChange={(e) => setNewQuestionAnswer(e.target.value)}
                      placeholder="정답"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        문제 점수
                      </label>
                      <div className="flex gap-4">
                        <input
                          type="number"
                          value={newQuestionScore}
                          onChange={(e) => setNewQuestionScore(e.target.value)}
                          placeholder="배점"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={handleAddQuestion}
                          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          문제 추가
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        관련 교과서 핵심 내용 및 성취기준 (선택사항)
                      </label>
                      <textarea
                        value={newQuestionEducationalContext}
                        onChange={(e) => setNewQuestionEducationalContext(e.target.value)}
                        placeholder="문제와 관련된 교과서 핵심 내용 및 성취기준을 입력하세요"
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        문제 이미지 (선택사항)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQuestionImageChange}
                        disabled={isUploadingQuestionImage}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      {isUploadingQuestionImage && (
                        <p className="text-sm text-blue-600 mt-2">📷 이미지 처리 중...</p>
                      )}
                      {newQuestionImagePreview && (
                        <div className="mt-3">
                          <p className="text-sm text-gray-600 mb-2">이미지 미리보기:</p>
                          <img
                            src={newQuestionImagePreview}
                            alt="문제 이미지 미리보기"
                            className="max-w-[50%] h-auto max-h-[200px] rounded-lg border border-gray-300 object-contain"
                          />
                          <button
                            onClick={() => {
                              setNewQuestionImageFile(null);
                              setNewQuestionImagePreview(null);
                              setNewQuestionImageUrl('');
                              const fileInput = document.querySelector('input[type="file"][accept="image/*"]');
                              if (fileInput) fileInput.value = '';
                            }}
                            className="mt-2 text-sm text-red-600 hover:text-red-700"
                          >
                            이미지 제거
                          </button>
                        </div>
                      )}
                      {/* 기존 URL 입력도 유지 (하위 호환성) */}
                      <input
                        type="text"
                        value={newQuestionImageUrl}
                        onChange={(e) => setNewQuestionImageUrl(e.target.value)}
                        placeholder="또는 이미지 URL을 직접 입력 (선택사항)"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-2"
                      />
                    </div>
                  </div>
                </div>

                {/* 문제 목록 & QR */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">문제 목록</h2>
                  <div className="space-y-6">
                    {teams.map((team) => (
                      <div key={team.id} className="border-2 border-gray-200 rounded-lg p-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-4">
                          {team.name} 팀
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {questions[team.id]?.map((question) => {
                            const qrUrl = `${window.location.origin}/play/${selectedActivity}/${team.id}/${question.questionId || question.id}`;
                            
                            // 해당 문제의 정답 제출자 찾기 (현재 활동의 submissions만 필터링)
                            const completedSubmission = submissions.find(sub => 
                              sub?.activityId === selectedActivity &&
                              sub.teamId === team.id &&
                              sub.questionId === (question.questionId || question.id) &&
                              sub.isCorrect === true
                            );
                            
                            return (
                              <div
                                key={question.id}
                                className="border border-gray-300 rounded-lg p-4"
                              >
                                <div className="mb-2">
                                  <p className="font-semibold">문제: {question.questionText}</p>
                                  {question.imageUrl && (
                                    <div className="mt-2 mb-2">
                                      <img
                                        src={question.imageUrl}
                                        alt="문제 이미지"
                                        className="max-w-[50%] h-auto max-h-[200px] rounded-lg border border-gray-300 object-contain"
                                      />
                                    </div>
                                  )}
                                  <p className="text-sm text-gray-600">정답: {question.answer}</p>
                                  <p className="text-sm text-blue-600">배점: {question.score}점</p>
                                  {question.completed && completedSubmission && (
                                    <p className="text-sm text-green-600 mt-1 font-semibold">
                                      ✅ 제출 완료, 제출자: {completedSubmission.studentName || '알 수 없음'}
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-2 mb-4 flex-wrap">
                                  <button
                                    onClick={() => {
                                      const newText = prompt('문제 내용 수정:', question.questionText);
                                      if (newText) {
                                        handleUpdateQuestion(team.id, question.id, 'questionText', newText);
                                      }
                                    }}
                                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                                  >
                                    내용 수정
                                  </button>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files[0];
                                      if (file) {
                                        handleUpdateQuestionImage(team.id, question.id, file);
                                      }
                                      // input 초기화
                                      e.target.value = '';
                                    }}
                                    className="hidden"
                                    id={`image-upload-${team.id}-${question.id}`}
                                    disabled={isUploadingQuestionImage}
                                  />
                                  <label
                                    htmlFor={`image-upload-${team.id}-${question.id}`}
                                    className={`px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm cursor-pointer inline-block ${
                                      isUploadingQuestionImage ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                                  >
                                    {isUploadingQuestionImage ? '업로드 중...' : '이미지 수정'}
                                  </label>
                                  <button
                                    onClick={() => {
                                      if (confirm('이미지를 삭제하시겠습니까?')) {
                                        handleUpdateQuestion(team.id, question.id, 'imageUrl', null);
                                      }
                                    }}
                                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                  >
                                    이미지 삭제
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm('정말 삭제하시겠습니까?')) {
                                        handleDeleteQuestion(team.id, question.id);
                                      }
                                    }}
                                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                  >
                                    삭제
                                  </button>
                                </div>
                                <div className="bg-gray-50 p-2 rounded">
                                  <QRCodeSVG value={qrUrl} size={128} />
                                  <p className="text-xs text-gray-500 mt-2 break-all">{qrUrl}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'monitoring' && (
              <div className="space-y-6">
                {/* 보안 경보 기준 점수 설정 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">보안 경보 시스템 설정</h2>
                  <div className="flex items-center gap-4">
                    <label className="text-gray-700 font-medium">
                      조커 팀 경보 기준 점수:
                    </label>
                    <input
                      type="number"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(parseInt(e.target.value) || -5)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-32"
                      placeholder="-5"
                    />
                    <span className="text-gray-600 text-sm">
                      (조커 팀 점수 합계가 이 값 이하일 때 경보가 작동합니다)
                    </span>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-700">
                      현재 조커 팀 점수 합계: <span className="font-bold text-blue-600">
                        {teams.filter(team => team.type === 'joker').reduce((sum, team) => sum + (team.score || 0), 0)}점
                      </span>
                    </p>
                  </div>
                </div>

                {/* 리더보드 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">리더보드</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teams
                      .sort((a, b) => (b.score || 0) - (a.score || 0))
                      .map((team) => (
                        <div
                          key={team.id}
                          className="p-4 border-2 border-gray-200 rounded-lg"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-lg">{team.name}</span>
                            <span
                              className={`px-3 py-1 rounded-full text-sm ${
                                team.type === 'joker'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {team.type === 'joker' ? '조커' : '시민'}
                            </span>
                          </div>
                          <div className="mt-2 text-2xl font-bold text-blue-600">
                            {team.score || 0}점
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 학생 실시간 답변 현황 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4">학생 실시간 답변 현황</h2>
                  {(() => {
                    // 현재 선택된 활동의 submissions만 필터링
                    const activitySubmissions = submissions.filter(sub => 
                      sub?.activityId === selectedActivity
                    );
                    
                    if (activitySubmissions.length === 0) {
                      return <p className="text-gray-500 text-center py-8">아직 제출된 답변이 없습니다.</p>;
                    }
                    
                    return (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto">
                        {activitySubmissions.map((submission) => {
                          const borderColor = submission?.isCorrect 
                            ? 'border-green-500' 
                            : 'border-red-500';
                          
                          let displayTime = '알 수 없음';
                          if (submission?.createdAt?.toDate) {
                            displayTime = submission.createdAt.toDate().toLocaleString('ko-KR');
                          } else if (submission?.submittedAt?.toDate) {
                            displayTime = submission.submittedAt.toDate().toLocaleString('ko-KR');
                          } else if (submission?.createdAt?.seconds) {
                            displayTime = new Date(submission.createdAt.seconds * 1000).toLocaleString('ko-KR');
                          } else if (submission?.submittedAt?.seconds) {
                            displayTime = new Date(submission.submittedAt.seconds * 1000).toLocaleString('ko-KR');
                          }
                          
                          return (
                            <div
                              key={submission?.id}
                              className={`border-2 ${borderColor} rounded-lg p-4 hover:shadow-lg transition-shadow bg-white`}
                            >
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">학생 이름</p>
                                  <p className="font-semibold text-gray-800">
                                    {submission?.studentName || '미입력'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">팀 이름</p>
                                  <p className="font-semibold text-gray-800">
                                    {submission?.teamName || '팀 정보 없음'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">문제</p>
                                  <p className="font-semibold text-gray-800 line-clamp-2">
                                    {submission?.questionText || '알 수 없음'}
                                  </p>
                                </div>
                              </div>

                              {/* 문제 내용 */}
                              <div className="mb-4 pb-4 border-b border-gray-200">
                                <p className="text-sm text-gray-600 mb-1">Q. 문제</p>
                                <p className="font-bold text-gray-800 text-lg">
                                  {submission?.questionText || '알 수 없음'}
                                </p>
                              </div>

                              {/* 학생 답변 섹션 */}
                              <div className="bg-blue-50 rounded-lg p-4 mb-3">
                                <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                                  🧑‍🎓 학생 답변
                                </p>
                                
                                {/* 단답형 정답 - 항상 표시 */}
                                <div className="mb-3">
                                  <p className="text-sm text-gray-600 mb-1">입력한 답:</p>
                                  {submission?.userAnswer ? (
                                    <p className="font-bold text-gray-800 text-lg">
                                      {submission.userAnswer}
                                    </p>
                                  ) : (
                                    <p className="text-gray-400 italic">답안이 없습니다.</p>
                                  )}
                                </div>
                                
                                {/* 서술형 풀이 */}
                                {(submission?.studentSolution || submission?.explanationText || submission?.text) && (
                                  <div className="mb-3">
                                    <p className="text-sm text-gray-600 mb-1">풀이 과정:</p>
                                    <div className="bg-gray-100 p-3 rounded-lg">
                                      <p className="text-gray-700 whitespace-pre-wrap">
                                        {submission?.studentSolution || submission?.explanationText || submission?.text}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                
                                {/* 첨부 사진 */}
                                {submission?.imageUrl && (
                                  <div className="mt-3">
                                    <p className="text-sm text-gray-600 mb-2">📸 첨부 사진</p>
                                    <a
                                      href={submission.imageUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-block cursor-pointer hover:opacity-80 transition-opacity"
                                    >
                                      <img
                                        src={submission.imageUrl}
                                        alt="학생 풀이 사진"
                                        className="max-w-xs max-h-32 rounded-lg border border-gray-300 object-contain shadow-sm"
                                      />
                                      <p className="text-xs text-blue-600 mt-1 hover:underline">클릭하여 원본 보기</p>
                                    </a>
                                  </div>
                                )}
                              </div>

                              {submission?.aiFeedback && (
                                <div className="mt-3">
                                  <p className="text-sm font-medium text-gray-700 mb-2">🤖 AI 피드백</p>
                                  <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
                                    <p className="text-gray-700 whitespace-pre-wrap">
                                      {submission.aiFeedback}
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="mt-3 flex justify-between items-center pt-3 border-t border-gray-200">
                                <p className="text-xs text-gray-500">
                                  제출 시간: {displayTime}
                                </p>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                    submission?.isCorrect
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {submission?.isCorrect ? '정답' : '오답'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                {/* 통계 서브 탭 메뉴 */}
                <div className="mb-6 border-b border-gray-200">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setStatisticsSubTab('students')}
                      className={`px-6 py-3 font-semibold transition-colors ${
                        statisticsSubTab === 'students'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      학생별 통계
                    </button>
                    <button
                      onClick={() => setStatisticsSubTab('questions')}
                      className={`px-6 py-3 font-semibold transition-colors ${
                        statisticsSubTab === 'questions'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      문항별 분석
                    </button>
                  </div>
                </div>

                {statisticsSubTab === 'students' && (
                  <>
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">학생 통계</h2>
                {(() => {
                  // 현재 선택된 활동의 submissions만 필터링
                  const activitySubmissions = submissions.filter(sub => 
                    sub?.activityId === selectedActivity
                  );
                  
                  if (activitySubmissions.length === 0) {
                    return <p className="text-gray-500 text-center py-8">아직 제출된 답변이 없습니다.</p>;
                  }
                  
                  // 학생별 통계 계산
                  const studentStats = {};
                  activitySubmissions.forEach(sub => {
                    const studentName = sub?.studentName || '미입력';
                    if (!studentStats[studentName]) {
                      studentStats[studentName] = {
                        name: studentName,
                        total: 0,
                        correct: 0,
                        incorrect: 0
                      };
                    }
                    studentStats[studentName].total++;
                    if (sub?.isCorrect) {
                      studentStats[studentName].correct++;
                    } else {
                      studentStats[studentName].incorrect++;
                    }
                  });
                  
                  const statsArray = Object.values(studentStats).map(stat => ({
                    ...stat,
                    accuracy: stat.total > 0 ? ((stat.correct / stat.total) * 100).toFixed(1) : 0
                  })).sort((a, b) => parseFloat(b.accuracy) - parseFloat(a.accuracy));
                  
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {statsArray.map((stat) => (
                          <div
                            key={stat.name}
                            className="border-2 border-gray-200 rounded-lg p-4"
                          >
                            <h3 className="font-semibold text-lg text-gray-800 mb-3">{stat.name}</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">총 제출:</span>
                                <span className="font-semibold">{stat.total}회</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-green-600">정답:</span>
                                <button
                                  onClick={() => {
                                    setSelectedStudentStat({ studentName: stat.name, type: 'correct' });
                                    setIsModalOpen(true);
                                  }}
                                  className={`font-semibold ${
                                    stat.correct > 0
                                      ? 'text-green-600 hover:text-green-700 hover:underline cursor-pointer'
                                      : 'text-gray-400 cursor-not-allowed'
                                  }`}
                                  disabled={stat.correct === 0}
                                >
                                  {stat.correct}회
                                </button>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-red-600">오답:</span>
                                <button
                                  onClick={() => {
                                    setSelectedStudentStat({ studentName: stat.name, type: 'incorrect' });
                                    setIsModalOpen(true);
                                  }}
                                  className={`font-semibold ${
                                    stat.incorrect > 0
                                      ? 'text-red-600 hover:text-red-700 hover:underline cursor-pointer'
                                      : 'text-gray-400 cursor-not-allowed'
                                  }`}
                                  disabled={stat.incorrect === 0}
                                >
                                  {stat.incorrect}회
                                </button>
                              </div>
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-700 font-medium">정답률:</span>
                                  <span className={`text-xl font-bold ${
                                    parseFloat(stat.accuracy) >= 70 ? 'text-green-600' :
                                    parseFloat(stat.accuracy) >= 50 ? 'text-yellow-600' :
                                    'text-red-600'
                                  }`}>
                                    {stat.accuracy}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                  </>
                )}

                {statisticsSubTab === 'questions' && (
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">문항별 분석</h2>
                    {(() => {
                      // 현재 선택된 활동의 submissions만 필터링
                      const activitySubmissions = submissions.filter(sub => 
                        sub?.activityId === selectedActivity
                      );
                      
                      if (activitySubmissions.length === 0) {
                        return <p className="text-gray-500 text-center py-8">아직 제출된 답변이 없습니다.</p>;
                      }

                      // 모든 문제 정보 수집
                      const allQuestions = teams.flatMap(team => 
                        (questions[team.id] || []).map(q => ({
                          ...q,
                          teamName: team.name,
                          teamId: team.id
                        }))
                      );

                      // 문제별 통계 계산
                      const questionStats = allQuestions.map(question => {
                        const questionId = question.questionId || question.id;
                        const questionSubmissions = activitySubmissions.filter(sub => 
                          sub?.questionId === questionId
                        );
                        
                        const totalAttempts = questionSubmissions.length;
                        const correctAttempts = questionSubmissions.filter(sub => sub?.isCorrect === true).length;
                        const incorrectAttempts = totalAttempts - correctAttempts;
                        const accuracy = totalAttempts > 0 
                          ? ((correctAttempts / totalAttempts) * 100).toFixed(1) 
                          : '0.0';
                        
                        return {
                          questionId,
                          questionText: question.questionText || '알 수 없음',
                          teamName: question.teamName || '알 수 없음',
                          totalAttempts,
                          correctAttempts,
                          incorrectAttempts,
                          accuracy: parseFloat(accuracy)
                        };
                      }).filter(stat => stat.totalAttempts > 0); // 시도가 있는 문제만 표시

                      // 정답률 기준 정렬
                      const sortedStats = [...questionStats].sort((a, b) => {
                        if (questionAnalysisSortOrder === 'asc') {
                          return a.accuracy - b.accuracy; // 낮은 순 (어려운 문제 순)
                        } else {
                          return b.accuracy - a.accuracy; // 높은 순
                        }
                      });

                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-gray-100 border-b-2 border-gray-300">
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">순위</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">문제 내용</th>
                                <th className="px-4 py-3 text-center font-semibold text-gray-700">시도 횟수</th>
                                <th className="px-4 py-3 text-center font-semibold text-gray-700">정답/오답</th>
                                <th 
                                  className="px-4 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                                  onClick={() => setQuestionAnalysisSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                >
                                  정답률 {questionAnalysisSortOrder === 'asc' ? '↑' : '↓'}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedStats.map((stat, index) => (
                                <tr
                                  key={stat.questionId}
                                  className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                                    stat.accuracy < 30 ? 'bg-red-50' : ''
                                  }`}
                                >
                                  <td className="px-4 py-3 text-gray-700 font-medium">
                                    {index + 1}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div>
                                      <p className="font-medium text-gray-800 line-clamp-2">
                                        {stat.questionText}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        ({stat.teamName})
                                      </p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center text-gray-700">
                                    {stat.totalAttempts}회
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="text-green-600 font-semibold">{stat.correctAttempts}</span>
                                    <span className="text-gray-400 mx-1">/</span>
                                    <span className="text-red-600 font-semibold">{stat.incorrectAttempts}</span>
                                  </td>
                                  <td className={`px-4 py-3 text-center font-semibold ${
                                    stat.accuracy < 30 ? 'text-red-600' :
                                    stat.accuracy < 50 ? 'text-yellow-600' :
                                    'text-green-600'
                                  }`}>
                                    {stat.accuracy}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {sortedStats.length === 0 && (
                            <p className="text-gray-500 text-center py-8">분석할 데이터가 없습니다.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 학생 통계 상세 보기 모달 */}
        {isModalOpen && selectedStudentStat && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="bg-white rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800">
                  {selectedStudentStat.studentName} 학생의 {selectedStudentStat.type === 'correct' ? '정답' : '오답'} 목록
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-semibold"
                >
                  ×
                </button>
              </div>

              {/* 모달 내용 */}
              <div className="flex-1 overflow-y-auto p-6">
                {(() => {
                  // 현재 선택된 활동의 submissions만 필터링
                  const activitySubmissions = submissions.filter(sub => 
                    sub?.activityId === selectedActivity
                  );
                  
                  // 선택된 학생의 정답/오답 제출 기록 필터링
                  const filteredSubmissions = activitySubmissions.filter(sub => {
                    const studentName = sub?.studentName || '미입력';
                    const isCorrect = sub?.isCorrect === true;
                    
                    return studentName === selectedStudentStat.studentName &&
                           ((selectedStudentStat.type === 'correct' && isCorrect) ||
                            (selectedStudentStat.type === 'incorrect' && !isCorrect));
                  });
                  
                  if (filteredSubmissions.length === 0) {
                    return (
                      <p className="text-gray-500 text-center py-8">
                        {selectedStudentStat.type === 'correct' ? '정답' : '오답'} 기록이 없습니다.
                      </p>
                    );
                  }
                  
                  return (
                    <div className="space-y-4">
                      {filteredSubmissions.map((submission) => {
                        // 문제 정보 찾기 (정답 정보를 위해)
                        const questionInfo = teams.flatMap(team => 
                          (questions[team.id] || []).map(q => ({
                            ...q,
                            teamName: team.name
                          }))
                        ).find(q => 
                          (q.questionId || q.id) === submission?.questionId
                        );
                        
                        return (
                          <div
                            key={submission?.id}
                            className="border-2 border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            {/* 문제 내용 */}
                            <div className="mb-4 pb-4 border-b border-gray-200">
                              <p className="text-sm text-gray-600 mb-1">Q. 문제</p>
                              <p className="font-bold text-gray-800 text-lg">
                                {submission?.questionText || questionInfo?.questionText || '알 수 없음'}
                              </p>
                              {selectedStudentStat.type === 'incorrect' && questionInfo?.answer && (
                                <p className="text-sm text-green-600 mt-2 font-semibold">
                                  정답: {questionInfo.answer}
                                </p>
                              )}
                            </div>

                            {/* 학생 답변 섹션 */}
                            <div className="bg-blue-50 rounded-lg p-4 mb-4">
                              <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                                🧑‍🎓 학생의 제출
                              </p>
                              
                              {/* 단답형 정답 - 항상 표시 */}
                              <div className="mb-3">
                                <p className="text-sm text-gray-600 mb-1">제출한 답:</p>
                                {submission?.userAnswer ? (
                                  <p className="font-bold text-gray-800 text-lg">
                                    {submission.userAnswer}
                                  </p>
                                ) : (
                                  <p className="text-gray-400 italic">답안이 없습니다.</p>
                                )}
                              </div>
                              
                              {/* 서술형 풀이 */}
                              {(submission?.studentSolution || submission?.explanationText || submission?.text) && (
                                <div className="mb-3">
                                  <p className="text-sm text-gray-600 mb-1">풀이 과정:</p>
                                  <div className="bg-gray-100 p-3 rounded-lg">
                                    <p className="text-gray-700 whitespace-pre-wrap">
                                      {submission?.studentSolution || submission?.explanationText || submission?.text}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {/* 첨부 사진 */}
                              {submission?.imageUrl && (
                                <div className="mt-3">
                                  <p className="text-sm text-gray-600 mb-2">📸 첨부 사진</p>
                                  <a
                                    href={submission.imageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                                  >
                                    <span className="text-sm text-blue-600 font-medium">📸 사진 보기</span>
                                  </a>
                                  <div className="mt-2">
                                    <img
                                      src={submission.imageUrl}
                                      alt="학생 풀이 사진"
                                      className="max-w-xs max-h-32 rounded-lg border border-gray-300 object-contain shadow-sm"
                                    />
                                  </div>
                                </div>
                              )}
                              
                              {!submission?.userAnswer && !submission?.studentSolution && !submission?.explanationText && !submission?.text && !submission?.imageUrl && (
                                <p className="text-gray-400 italic">제출 내용이 없습니다.</p>
                              )}
                            </div>

                            {/* AI 피드백 요약 */}
                            {submission?.aiFeedback && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <p className="text-sm text-gray-600 mb-2">🤖 AI 피드백 요약</p>
                                <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
                                  <p className="text-gray-700 line-clamp-2">
                                    {submission.aiFeedback}
                                  </p>
                                  {submission.aiFeedback.length > 100 && (
                                    <button
                                      onClick={() => {
                                        // 전체 피드백 보기 (선택사항)
                                        alert(submission.aiFeedback);
                                      }}
                                      className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                                    >
                                      전체 보기
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 추가 정보 */}
                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
                              <span>팀: {submission?.teamName || '알 수 없음'}</span>
                              {submission?.submittedAt && (
                                <span>
                                  제출 시간: {
                                    submission.submittedAt.toDate 
                                      ? submission.submittedAt.toDate().toLocaleString('ko-KR')
                                      : submission.submittedAt.seconds
                                      ? new Date(submission.submittedAt.seconds * 1000).toLocaleString('ko-KR')
                                      : '알 수 없음'
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* 모달 하단 닫기 버튼 */}
              <div className="p-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

