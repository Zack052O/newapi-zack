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
import { Image01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { fetchDrawImageBlob, isProtectedDrawImageUrl } from '../api'

type DrawImageProps = {
  src: string
  alt: string
  className?: string
}

// Generated images are persisted server-side and require the dashboard auth
// header, so they are fetched through the authenticated client and rendered
// as blob URLs. Cache the resolved URL per source to avoid re-downloading the
// same image for the history thumbnail and the workspace preview.
const blobUrlCache = new Map<string, Promise<string>>()

function resolveDrawImageUrl(src: string): Promise<string> {
  const cached = blobUrlCache.get(src)
  if (cached) return cached
  const pending = fetchDrawImageBlob(src)
    .then((blob) => URL.createObjectURL(blob))
    .catch((error) => {
      blobUrlCache.delete(src)
      throw error
    })
  blobUrlCache.set(src, pending)
  return pending
}

export function DrawImage(props: DrawImageProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setFailed(false)
    if (!isProtectedDrawImageUrl(props.src)) {
      setUrl(props.src)
      return
    }
    void resolveDrawImageUrl(props.src)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [props.src])

  if (failed) {
    return (
      <div
        role='img'
        aria-label={props.alt}
        className={cn(
          'bg-muted text-muted-foreground flex items-center justify-center',
          props.className
        )}
      >
        <HugeiconsIcon
          icon={Image01Icon}
          strokeWidth={1.7}
          className='size-5'
        />
        <span className='sr-only'>{t('Failed to load image')}</span>
      </div>
    )
  }

  if (!url) {
    return (
      <div aria-busy='true' className={cn('relative', props.className)}>
        <Skeleton className='absolute inset-0 size-full rounded-none' />
      </div>
    )
  }

  return (
    <img src={url} alt={props.alt} className={props.className} loading='lazy' />
  )
}
