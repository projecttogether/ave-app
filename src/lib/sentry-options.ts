import type { init } from '@sentry/nextjs'
import { stripQueryDetails } from './errors'

export const sentryOptions = {
  dsn: 'https://54742155ccc460d4e2753c167dac2f9f@o4511987937705984.ingest.de.sentry.io/4512174513913936',
  enabled: process.env.NODE_ENV !== 'test' && process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,
  // Match the application's data policy: exclude identities and business payloads.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    queues: false,
  },
  // Existing console logs may contain confidential application data.
  beforeBreadcrumb(breadcrumb) {
    return breadcrumb.category === 'console' ? null : breadcrumb
  },
  // Database query errors embed the SQL and its parameters in their message,
  // e.g. questionnaire answers; SMTP errors can quote recipients.
  beforeSend(event) {
    for (const exception of event.exception?.values ?? []) {
      if (exception.value) exception.value = stripQueryDetails(exception.value)
    }
    if (event.message) event.message = stripQueryDetails(event.message)
    return event
  },
} satisfies Parameters<typeof init>[0]
