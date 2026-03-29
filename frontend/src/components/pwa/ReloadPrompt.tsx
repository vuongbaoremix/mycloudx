// @ts-ignore
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { toast } from 'sonner'

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: any) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error: any) {
      console.error('SW registration error', error)
    },
  })

  useEffect(() => {
    if (needRefresh) {
      toast('Có bản cập nhật mới', {
        description: 'Đã tải xong phiên bản mới nhất. Vui lòng làm mới trang để áp dụng.',
        duration: Infinity,
        action: {
          label: 'Làm mới',
          onClick: () => updateServiceWorker(true),
        },
        onDismiss: () => setNeedRefresh(false),
      })
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
