// answerChecker.js
import { evaluate } from 'mathjs';

/**
 * 사용자 답안과 정답을 비교하는 함수
 * @param {string} userAnswer - 사용자가 입력한 답안
 * @param {string} correctAnswer - 정답
 * @returns {boolean} - 정답 여부
 */
export function checkAnswer(userAnswer, correctAnswer) {
  // 공백 제거 및 소문자 변환
  const normalizedUser = userAnswer.replace(/\s/g, '').toLowerCase();
  const normalizedCorrect = correctAnswer.replace(/\s/g, '').toLowerCase();

  // 1. 단순 문자열 비교
  if (normalizedUser === normalizedCorrect) {
    return true;
  }

  // 2. 수학적 계산으로 비교 시도
  try {
    const userValue = evaluate(normalizedUser);
    const correctValue = evaluate(normalizedCorrect);
    
    // 수치 비교 (부동소수점 오차 고려)
    return Math.abs(userValue - correctValue) < 0.0001;
  } catch (error) {
    // 수식이 아닌 경우 에러 발생 -> 단순 문자열 비교 결과만 반환
    return false;
  }
}

