import { maskSensitiveFields } from './redact'

type LogLevel = 'info' | 'warn' | 'error' | 'security'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  service: string
  environment: string
  metadata?: Record<string, unknown>
}

function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'ave-dashboard',
    environment: process.env.NODE_ENV || 'development',
    // Logs leave the application (Coolify, support requests): mask emails and secrets.
    ...(metadata && { metadata: maskSensitiveFields(metadata) }),
  }

  const output = JSON.stringify(entry)

  switch (level) {
    case 'error':
    case 'security':
      console.error(output)
      break
    case 'warn':
      console.warn(output)
      break
    default:
      console.log(output)
  }
}

export const logger = {
  info: (message: string, metadata?: Record<string, unknown>) => log('info', message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => log('warn', message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => log('error', message, metadata),
  security: (message: string, metadata?: Record<string, unknown>) => log('security', message, metadata),
}
