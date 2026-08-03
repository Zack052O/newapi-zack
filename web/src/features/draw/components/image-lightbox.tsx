/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { GeneratedImage } from '../types'
import { DrawImage } from './draw-image'

type ImageLightboxProps = {
  image: GeneratedImage | null
  onClose: () => void
}

export function ImageLightbox(props: ImageLightboxProps) {
  const { t } = useTranslation()
  const { image, onClose } = props

  useEffect(() => {
    if (!image) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [image, onClose])

  if (!image) return null

  return (
    <div
      data-testid='image-lightbox'
      role='dialog'
      aria-modal='true'
      aria-label={t('Image preview')}
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4'
      onClick={onClose}
    >
      <div
        className='relative max-h-full max-w-full'
        onClick={(event) => event.stopPropagation()}
      >
        <DrawImage
          src={image.src}
          alt={t('Generated image')}
          className='max-h-[85vh] max-w-[85vw] rounded-lg bg-black shadow-2xl'
        />
        <Button
          type='button'
          size='icon-sm'
          variant='secondary'
          aria-label={t('Close preview')}
          className='absolute -top-3 -right-3 rounded-full'
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}
