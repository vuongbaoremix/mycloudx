import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export const useConfirm = () => {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider')
  return context
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<{ fn: (v: boolean) => void } | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    setIsOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolver({ fn: resolve })
    })
  }, [])

  const handleConfirm = () => {
    setIsOpen(false)
    if (resolver) resolver.fn(true)
  }

  const handleCancel = () => {
    setIsOpen(false)
    if (resolver) resolver.fn(false)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      <AnimatePresence>
        {isOpen && options && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCancel}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              className="relative bg-surface w-full max-w-[400px] rounded-2xl md:rounded-[2rem] shadow-2xl border border-outline-variant/20 overflow-hidden"
            >
              <div className="p-6 md:p-8 flex flex-col items-center text-center">
                {options.isDestructive ? (
                  <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-5 text-danger">
                    <span className="material-symbols-outlined text-[28px]" data-icon="warning">warning</span>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5 text-primary">
                    <span className="material-symbols-outlined text-[28px]" data-icon="help">help</span>
                  </div>
                )}
                <h3 className="text-xl md:text-2xl font-bold text-on-surface mb-3 font-headline leading-tight">{options.title}</h3>
                <div className="text-sm md:text-base text-on-surface-variant font-medium leading-relaxed">
                  {options.message}
                </div>
              </div>

              <div className="p-4 md:p-6 bg-surface-container-lowest flex items-center justify-center gap-3 border-t border-outline-variant/10">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 px-4 rounded-xl text-sm md:text-base font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors active:scale-95"
                >
                  {options.cancelText || 'Hủy'}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm md:text-base font-bold shadow-sm transition-all active:scale-95 ${options.isDestructive
                      ? 'bg-danger text-white hover:bg-danger-dim'
                      : 'bg-primary text-white hover:bg-primary-dim'
                    }`}
                >
                  {options.confirmText || 'Xác nhận'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}
