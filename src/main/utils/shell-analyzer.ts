/**
 * A basic shell command analyzer to identify segments in a command line (commands, pipes, semi-colons).
 * It helps PolicyEngine to look into each individual command in a complex chain.
 */

export interface CommandSegment {
  raw: string;
  command: string;
  args: string[];
}

export class ShellAnalyzer {
  /**
   * Splits a shell command line into segments by pipes (|), semi-colons (;), and double ampersands (&&).
   * Note: This is a simplified version and doesn't handle all shell complexities (like quoted pipes),
   * but it's much better than simple string matching.
   */
  static splitSegments(commandLine: string): CommandSegment[] {
    // Basic split by delimiters, ignoring those inside quotes would be better but let's start with a robust split
    // Regex to split by |, ;, &&, || while trying to avoid splitting inside quotes (simplified)
    const delimiters = /\|\||&&|[|;]/g;
    const parts = commandLine.split(delimiters).map(p => p.trim()).filter(Boolean);

    return parts.map(part => {
      const tokens = this.tokenize(part);
      return {
        raw: part,
        command: tokens[0] || '',
        args: tokens.slice(1)
      };
    });
  }

  /**
   * Tokenizes a command part into command and arguments, respecting quotes.
   */
  private static tokenize(part: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;
    let escaped = false;

    for (let i = 0; i < part.length; i++) {
      const char = part[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inQuote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) tokens.push(current);
    return tokens;
  }

  /**
   * Checks if a command segment involves a dangerous redirection.
   */
  static hasDangerousRedirection(segment: string): boolean {
    const redirectionMatch = segment.match(/>\s*([^\s]+)/);
    if (!redirectionMatch) return false;

    const target = redirectionMatch[1].toLowerCase();
    const dangerousPaths = ['/etc/', '/boot/', '/root/', '/dev/sd', '/dev/nvme'];
    return dangerousPaths.some(path => target.includes(path));
  }
}
