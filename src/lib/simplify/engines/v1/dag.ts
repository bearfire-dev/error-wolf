import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"

export const V1_PIPELINE_DAG: SimplifyPipelineNode[] = [
  { id: "preprocess", label: "normalize", dependsOn: [] },
  { id: "analysis-1", label: "compress-min", dependsOn: ["preprocess"] },
  { id: "analysis-2", label: "compress-source", dependsOn: ["preprocess"] },
  { id: "analysis-3", label: "compress-noise", dependsOn: ["preprocess"] },
  {
    id: "synthesis",
    label: "merge",
    dependsOn: ["analysis-1", "analysis-2", "analysis-3"],
  },
]
