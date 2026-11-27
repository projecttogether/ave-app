"use client"

import { createContext, useContext, ReactNode } from "react"
import { defaultAppContent } from "@/lib/content/defaults"

type ContentDictionary = Record<string, string>

const ContentContext = createContext<ContentDictionary>(defaultAppContent)

interface ContentProviderProps {
  content: ContentDictionary
  children: ReactNode
}

export function ContentProvider({ content, children }: ContentProviderProps) {
  return (
    <ContentContext.Provider value={content}>
      {children}
    </ContentContext.Provider>
  )
}

/**
 * Custom hook to translate/retrieve a content string by key.
 * If the key doesn't exist in the DB, it falls back to the default dictionary.
 * If it doesn't exist in the default dictionary, it returns an empty string 
 * so that logical OR (||) fallback strings can activate.
 */
export function useContent() {
  const content = useContext(ContentContext)

  return (key: string): string => {
    return content[key] ?? defaultAppContent[key] ?? ''
  }
}
