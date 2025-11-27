// AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  increment,
  writeBatch
} from 'firebase/firestore';
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
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState('citizen');
  const [selectedTeamForQuestion, setSelectedTeamForQuestion] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionAnswer, setNewQuestionAnswer] = useState('');
  const [newQuestionScore, setNewQuestionScore] = useState(10);

  // 로그인 처리
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPassword('');
    } else {
      alert('비밀번호가 올바르지 않습니다.');
    }
  };

  // 활동 생성
  const handleCreateActivity = async () => {
    if (!newActivityName.trim()) return;
    
    try {
      await addDoc(collection(db, 'activities'), {
        name: newActivityName,
        createdAt: new Date()
      });
      setNewActivityName('');
      loadActivities();
    } catch (error) {
      console.error('활동 생성 오류:', error);
      alert('활동 생성에 실패했습니다.');
    }
  };

  // 활동 목록 로드
  const loadActivities = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'activities'));
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

  // 팀 추가
  const handleAddTeam = async () => {
    if (!selectedActivity || !newTeamName.trim()) return;
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      await addDoc(collection(activityRef, 'teams'), {
        name: newTeamName,
        type: newTeamType,
        score: 0
      });
      setNewTeamName('');
      loadTeams();
    } catch (error) {
      console.error('팀 추가 오류:', error);
      alert('팀 추가에 실패했습니다.');
    }
  };

  // 팀 목록 로드
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
      
      // 각 팀의 문제 목록도 로드
      const questionsMap = {};
      for (const team of teamsList) {
        const teamRef = doc(activityRef, 'teams', team.id);
        const questionsSnapshot = await getDocs(collection(teamRef, 'questions'));
        questionsMap[team.id] = questionsSnapshot.docs.map(qDoc => ({
          id: qDoc.id,
          ...qDoc.data()
        }));
      }
      setQuestions(questionsMap);
    } catch (error) {
      console.error('팀 목록 로드 오류:', error);
    }
  };

  // 문제 추가
  const handleAddQuestion = async () => {
    if (!selectedActivity || !selectedTeamForQuestion || !newQuestionText.trim() || !newQuestionAnswer.trim()) return;
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity);
      const teamRef = doc(activityRef, 'teams', selectedTeamForQuestion);
      
      const docRef = await addDoc(collection(teamRef, 'questions'), {
        questionText: newQuestionText,
        answer: newQuestionAnswer,
        score: parseInt(newQuestionScore)
      });
      
      // questionId 필드에 문서 ID 저장
      await updateDoc(docRef, {
        questionId: docRef.id
      });
      
      setNewQuestionText('');
      setNewQuestionAnswer('');
      setNewQuestionScore(10);
      loadTeams();
    } catch (error) {
      console.error('문제 추가 오류:', error);
      alert('문제 추가에 실패했습니다.');
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
                  const studentName = notif.text.replace(' 학생이 퇴출되었습니다!', '').trim();
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
                  const studentName = notif.text.replace(' 학생이 퇴출되었습니다!', '').trim();
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
    <div className="min-h-screen bg-gray-100 p-6">
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
              onClick={() => {
                if (confirm('현재 활동의 퇴출자 명단을 모두 삭제하시겠습니까?')) {
                  setEliminatedList(prev => prev.filter(item => item.activityId !== selectedActivity));
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
        <h1 className="text-4xl font-bold text-gray-800 mb-8">관리자 대시보드</h1>

        {/* 활동 생성 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">활동 생성</h2>
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
        </div>

        {/* 활동 선택 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">활동 목록</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedActivity === activity.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setSelectedActivity(activity.id)}
                    className="flex-1 text-left font-semibold text-lg hover:text-blue-600 transition-colors"
                  >
                    {activity.name}
                  </button>
                  <div className="flex gap-2 ml-2">
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

        {selectedActivity && (
          <>
            {/* 팀 등록 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
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
                <button
                  onClick={handleAddTeam}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  팀 추가
                </button>
              </div>
            </div>

            {/* 리더보드 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
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

            {/* 문제 등록 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
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
                        return (
                          <div
                            key={question.id}
                            className="border border-gray-300 rounded-lg p-4"
                          >
                            <div className="mb-2">
                              <p className="font-semibold">문제: {question.questionText}</p>
                              <p className="text-sm text-gray-600">정답: {question.answer}</p>
                              <p className="text-sm text-blue-600">배점: {question.score}점</p>
                            </div>
                            <div className="flex gap-2 mb-4">
                              <button
                                onClick={() => {
                                  const newText = prompt('문제 내용 수정:', question.questionText);
                                  if (newText) {
                                    handleUpdateQuestion(team.id, question.id, 'questionText', newText);
                                  }
                                }}
                                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                              >
                                수정
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
          </>
        )}
      </div>
    </div>
  );
}

