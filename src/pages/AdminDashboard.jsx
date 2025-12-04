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
  const [newActivityEducationalContext, setNewActivityEducationalContext] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState('citizen');
  const [selectedTeamForQuestion, setSelectedTeamForQuestion] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionAnswer, setNewQuestionAnswer] = useState('');
  const [newQuestionScore, setNewQuestionScore] = useState(10);
  const [newQuestionEducationalContext, setNewQuestionEducationalContext] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions', 'monitoring', 'statistics'
  const [selectedStudentStat, setSelectedStudentStat] = useState(null); // { studentName: string, type: 'correct' | 'incorrect' }
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      
      const questionData = {
        questionText: newQuestionText,
        answer: newQuestionAnswer,
        score: parseInt(newQuestionScore)
      };
      
      if (newQuestionEducationalContext.trim()) {
        questionData.educationalContext = newQuestionEducationalContext.trim();
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
                    <button
                      onClick={handleAddTeam}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      팀 추가
                    </button>
                  </div>
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
                                  <p className="text-sm text-gray-600">정답: {question.answer}</p>
                                  <p className="text-sm text-blue-600">배점: {question.score}점</p>
                                  {question.completed && completedSubmission && (
                                    <p className="text-sm text-green-600 mt-1 font-semibold">
                                      ✅ 제출 완료, 제출자: {completedSubmission.studentName || '알 수 없음'}
                                    </p>
                                  )}
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
              </div>
            )}

            {activeTab === 'monitoring' && (
              <div className="space-y-6">
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

