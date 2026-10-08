// echo tool: returns its input wrapped in a ToolResult-like object
export default function analyze(input: unknown) {
  return { metrics: {}, usable: true, echo: input };
}
