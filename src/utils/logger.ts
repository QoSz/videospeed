/**
 * Logging utility for Video Speed Controller
 */

import { LOG_LEVELS } from './constants';

export class Logger {
  public verbosity: number;
  public defaultLevel: number;
  public contextStack: string[];

  constructor() {
    this.verbosity = 3; // Default warning level
    this.defaultLevel = 4; // Default info level
    this.contextStack = []; // Stack for nested contexts
  }

  /**
   * Set logging verbosity level
   */
  setVerbosity(level: number): void {
    this.verbosity = level;
  }

  /**
   * Set default logging level
   */
  setDefaultLevel(level: number): void {
    this.defaultLevel = level;
  }

  /**
   * Generate video/controller context string from context stack
   */
  private generateContext(): string {
    if (this.contextStack.length > 0) {
      return `[${this.contextStack[this.contextStack.length - 1]}] `;
    }
    return '';
  }

  /**
   * Format video element identifier using controller ID
   */
  formatVideoId(video: HTMLMediaElement | null): string {
    if (!video) {
      return 'V?';
    }

    const isAudio = video.tagName === 'AUDIO';
    const prefix = isAudio ? 'A' : 'V';

    // Use controller ID if available (this is what we want!)
    const vscMedia = video as HTMLMediaElement & { vsc?: { controllerId: number } };
    if (vscMedia.vsc?.controllerId) {
      return `${prefix}${vscMedia.vsc.controllerId}`;
    }

    // Fallback for videos without controllers
    return `${prefix}?`;
  }

  /**
   * Push context onto stack (for nested operations)
   */
  pushContext(context: string | HTMLMediaElement): void {
    if (typeof context === 'string') {
      this.contextStack.push(context);
    } else if (
      context &&
      (context.tagName === 'VIDEO' || context.tagName === 'AUDIO')
    ) {
      this.contextStack.push(this.formatVideoId(context));
    }
  }

  /**
   * Pop context from stack
   */
  popContext(): void {
    this.contextStack.pop();
  }

  /**
   * Execute function with context
   */
  withContext<T>(context: string | HTMLMediaElement, fn: () => T): T {
    this.pushContext(context);
    try {
      return fn();
    } finally {
      this.popContext();
    }
  }

  /**
   * Log a message with specified level
   */
  log(message: string, level?: number): void {
    const logLevel =
      typeof level === 'undefined' ? this.defaultLevel : level;

    if (this.verbosity >= logLevel) {
      const context = this.generateContext();
      const contextualMessage = `${context}${message}`;

      switch (logLevel) {
        case LOG_LEVELS.ERROR:
          console.log(`ERROR:${contextualMessage}`);
          break;
        case LOG_LEVELS.WARNING:
          console.log(`WARNING:${contextualMessage}`);
          break;
        case LOG_LEVELS.INFO:
          console.log(`INFO:${contextualMessage}`);
          break;
        case LOG_LEVELS.DEBUG:
          console.log(`DEBUG:${contextualMessage}`);
          break;
        case LOG_LEVELS.VERBOSE:
          console.log(`DEBUG (VERBOSE):${contextualMessage}`);
          console.trace();
          break;
        default:
          console.log(contextualMessage);
      }
    }
  }

  /**
   * Log error message
   */
  error(message: string): void {
    if (this.verbosity >= 1) {
      this.log(message, 1);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string): void {
    if (this.verbosity >= 2) {
      this.log(message, 2);
    }
  }

  /**
   * Log info message
   */
  info(message: string): void {
    if (this.verbosity >= 3) {
      this.log(message, 3);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string): void {
    if (this.verbosity >= 4) {
      this.log(message, 4);
    }
  }

  /**
   * Log verbose debug message with stack trace
   */
  verbose(message: string): void {
    if (this.verbosity >= 5) {
      this.log(message, 5);
    }
  }
}

// Create singleton instance and assign to global namespace
window.VSC = window.VSC || ({} as Window['VSC']);
window.VSC.logger = new Logger();
