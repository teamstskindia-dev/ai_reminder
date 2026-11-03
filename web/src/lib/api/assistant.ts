import { api } from "./client";
import type { AskInput, AskResult, AssistantMessage, AssistantThread } from "./types";

export const assistantApi = {
  ask: (input: AskInput) => api.post<AskResult>("/assistant/ask", input),
  threads: (page = 1, limit = 50) => api.page<AssistantThread>("/assistant/threads", { page, limit }),
  messages: (threadId: string) => api.get<AssistantMessage[]>(`/assistant/threads/${threadId}/messages`),
  removeThread: (threadId: string) => api.delete(`/assistant/threads/${threadId}`),
};
