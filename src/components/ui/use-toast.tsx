'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'

interface Toast {
    id: string
    title: string
    description?: string
    variant?: 'default' | 'destructive'
}

interface ToastContextType {
    toast: (props: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within ToastProvider')
    return ctx
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
        const timer = setTimeout(() => {
            setVisible(false)
            setTimeout(() => onDismiss(toast.id), 300)
        }, 4000)
        return () => clearTimeout(timer)
    }, [toast.id, onDismiss])

    const isDestructive = toast.variant === 'destructive'

    return (
        <div
            style={{
                transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 1rem))',
                opacity: visible ? 1 : 0,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                background: '#ffffff',
                border: `1px solid ${isDestructive ? '#fca5a5' : '#e6dbd0'}`,
                borderRadius: '0.75rem',
                padding: '0.875rem 1rem',
                boxShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                maxWidth: '24rem',
                width: '100%',
                pointerEvents: 'auto' as const,
            }}
        >
            {isDestructive ? (
                <AlertCircle style={{ width: 20, height: 20, color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
            ) : (
                <CheckCircle2 style={{ width: 20, height: 20, color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: '#1a1a1a',
                    margin: 0,
                    lineHeight: 1.4,
                }}>
                    {toast.title}
                </p>
                {toast.description && (
                    <p style={{
                        fontSize: '0.8125rem',
                        color: '#737373',
                        margin: '0.25rem 0 0 0',
                        lineHeight: 1.4,
                    }}>
                        {toast.description}
                    </p>
                )}
            </div>
            <button
                onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300) }}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.125rem',
                    color: '#737373',
                    flexShrink: 0,
                }}
            >
                <X style={{ width: 16, height: 16 }} />
            </button>
        </div>
    )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const toast = useCallback((props: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).slice(2)
        setToasts(prev => [...prev, { ...props, id }])
    }, [])

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    right: '1.5rem',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    pointerEvents: 'none',
                }}
            >
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    )
}
