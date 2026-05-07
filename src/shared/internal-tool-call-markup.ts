const TEXT_TOOL_CALL_SECTION_PATTERN =
  /<tool_calls_section_begin>[\s\S]*?(?:<tool_calls_section_end>|$)/gi
const TEXT_TOOL_CALL_PATTERN = /<tool_call_begin>[\s\S]*?(?:<tool_call_end>|$)/gi

export function stripInternalToolCallMarkup(value: string): string {
  return value
    .replace(TEXT_TOOL_CALL_SECTION_PATTERN, '')
    .replace(TEXT_TOOL_CALL_PATTERN, '')
    .replace(/<tool_calls_section_(?:begin|end)>/gi, '')
    .replace(/<tool_call_argument_begin>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
