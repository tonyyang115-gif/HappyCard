import { GoogleGenAI } from "@google/genai";
import { Player, Round } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateMatchCommentary = async (players: Player[], rounds: Round[]): Promise<string> => {
  try {
    const playerSummary = players.map(p => `${p.name} (总分: ${p.totalScore})`).join(', ');
    const roundSummary = rounds.map((r, i) => `第${i + 1}局: ${JSON.stringify(r.scores)}`).join('\n');

    const prompt = `
      你是一个幽默风趣的棋牌游戏解说员。请根据以下的打牌对局数据，对这场比赛进行一段简短、犀利且好笑的点评。
      
      玩家最终得分: ${playerSummary}
      
      对局历史:
      ${roundSummary}
      
      请指出谁是"大赢家"，谁是"慈善家"（输得最多的人），并简要分析一下关键的转折点（如果有）。保持语气轻松，像朋友之间的调侃。100字左右。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "无法生成点评，请稍后再试。";
  } catch (error) {
    console.error("Gemini AI generation failed:", error);
    return "智能解说员正在休息，暂时无法点评。";
  }
};
