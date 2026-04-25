// Acumen — shared API types (mirrors backend Pydantic models)

export interface ClusterPreview {
  cluster_id: number;
  chunk_count: number;
  preview: string;
}

export interface UploadResponse {
  message: string;
  total_chunks: number;
  clusters: ClusterPreview[];
  session_id: string;
}

export interface WikiPage {
  cluster_id: number;
  topic_title: string;
  summary: string;
  key_terms: string[];
  insights: string[];
}

export interface SynthesizeResponse {
  session_id: string;
  wiki_pages: WikiPage[];
  errors: string[];
}

export interface StatusResponse {
  session_id: string;
  status: "processing" | "completed" | "error";
  clusters?: ClusterPreview[];
}

export interface NotebookStatus {
  processing: boolean;
  error: boolean;
}

export interface NodeData {
  label: string;
  summary: string;
  cluster_id: number;
}

export interface ReactFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  animated: boolean;
  style?: { stroke: string };
}

export interface GraphDataResponse {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Message = ChatMessage & {
  toolUsed?: string | null;
  toolOutput?: unknown;
  isWebAugmented?: boolean;
};

export interface Notebook {
  id: string;
  title: string;
  history: Message[];
  created_at?: string;
  sourceType?: "pdf" | "url";
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  tool_used: string | null;
  tool_output: unknown;
  is_web_augmented: boolean;
}
