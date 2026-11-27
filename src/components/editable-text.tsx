"use client"

interface EditableTextProps {
  contentKey: string
  initialValue: string
  children: React.ReactNode
  isTextarea?: boolean
  className?: string
}

export function EditableText({ children, className = "" }: EditableTextProps) {
  // We've removed the interactive edit mode functionalities 
  // to favor a centralized admin area for content management.
  return (
    <div className={`relative ${className}`}>
      {children}
    </div>
  )
}
