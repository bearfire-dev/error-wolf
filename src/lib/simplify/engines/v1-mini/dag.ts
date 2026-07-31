import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"

export const V1_MINI_PIPELINE_DAG: SimplifyPipelineNode[] = [
  { id: "preprocess", label: "normalize", dependsOn: [] },
  { id: "compress", label: "compress", dependsOn: ["preprocess"] },
]
