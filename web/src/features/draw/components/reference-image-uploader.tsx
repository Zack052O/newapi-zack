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
import { Cancel01Icon, ImageUpload01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { ReferenceImage } from '../types'

const MAX_REFERENCE_IMAGES = 4
const MAX_REFERENCE_IMAGE_SIZE_MB = 5
const MAX_REFERENCE_IMAGES_TOTAL_SIZE_MB = 12
const IMAGE_FILE_NAME_PATTERN = /\.(png|jpe?g|webp|gif|avif|bmp|heic|svg)$/i

function isSupportedImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') || IMAGE_FILE_NAME_PATTERN.test(file.name)
  )
}

type ReferenceImageUploaderProps = {
  images: ReferenceImage[]
  disabled: boolean
  onChange: (images: ReferenceImage[]) => void
}

function readImage(file: File): Promise<ReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read image'))
        return
      }
      resolve({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        size: file.size,
        dataUrl: reader.result,
      })
    })
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

export function ReferenceImageUploader(props: ReferenceImageUploaderProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const addFiles = async (fileList: FileList | File[]) => {
    const files = [...fileList]
    if (files.some((file) => !isSupportedImageFile(file))) {
      toast.error(t('Only image files are supported'))
      return
    }
    if (
      files.some(
        (file) => file.size > MAX_REFERENCE_IMAGE_SIZE_MB * 1024 * 1024
      )
    ) {
      toast.error(
        t('Each image must be smaller than {{size}} MB', {
          size: MAX_REFERENCE_IMAGE_SIZE_MB,
        })
      )
      return
    }
    if (props.images.length + files.length > MAX_REFERENCE_IMAGES) {
      toast.error(
        t('You can upload up to {{count}} reference images', {
          count: MAX_REFERENCE_IMAGES,
        })
      )
      return
    }
    const existingSize = props.images.reduce(
      (total, image) => total + image.size,
      0
    )
    const newSize = files.reduce((total, file) => total + file.size, 0)
    if (
      existingSize + newSize >
      MAX_REFERENCE_IMAGES_TOTAL_SIZE_MB * 1024 * 1024
    ) {
      toast.error(
        t('Reference images must total less than {{size}} MB', {
          size: MAX_REFERENCE_IMAGES_TOTAL_SIZE_MB,
        })
      )
      return
    }

    try {
      const newImages = await Promise.all(files.map(readImage))
      props.onChange([...props.images, ...newImages])
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      toast.error(t('Failed to read reference images'))
    }
  }

  const handleReorder = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return
    const next = [...props.images]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, moved)
    props.onChange(next)
  }

  const resetDragState = () => {
    setDragIndex(null)
    setDropIndex(null)
  }

  return (
    <div data-testid='reference-image-uploader' className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <label className='text-xs font-medium' htmlFor='draw-reference-images'>
          {t('Reference images')}
        </label>
        <span className='text-muted-foreground text-xs'>
          {props.images.length}/{MAX_REFERENCE_IMAGES}
        </span>
      </div>
      {props.images.length > 0 && (
        <div className='flex shrink-0 scrollbar-thin gap-2 overflow-x-auto pb-1'>
          {props.images.map((image, index) => (
            <div
              key={image.id}
              data-testid='reference-image-thumb'
              draggable
              onDragStart={(event) => {
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = 'move'
                }
                setDragIndex(index)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (dragIndex !== null && dragIndex !== index) {
                  setDropIndex(index)
                }
              }}
              onDragLeave={() => {
                if (dropIndex === index) setDropIndex(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleReorder(index)
                resetDragState()
              }}
              onDragEnd={resetDragState}
              className={cn(
                'group ring-foreground/10 relative size-14 shrink-0 cursor-grab overflow-hidden rounded-md ring-1 active:cursor-grabbing sm:size-16',
                dragIndex === index && 'opacity-50',
                dropIndex === index &&
                  dragIndex !== null &&
                  'ring-primary ring-2'
              )}
              title={t('Drag to reorder')}
            >
              <img
                src={image.dataUrl}
                alt={image.name}
                className='size-full object-cover'
              />
              <Button
                type='button'
                size='icon-xs'
                variant='secondary'
                aria-label={t('Remove reference image')}
                className='absolute top-0.5 right-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
                onClick={() =>
                  props.onChange(
                    props.images.filter(
                      (candidate) => candidate.id !== image.id
                    )
                  )
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </div>
          ))}
        </div>
      )}
      {props.images.length < MAX_REFERENCE_IMAGES && (
        <label
          htmlFor='draw-reference-images'
          aria-disabled={props.disabled}
          className='border-border bg-muted/20 hover:bg-muted/40 focus-within:ring-ring/50 flex min-h-14 shrink-0 cursor-pointer flex-row flex-wrap items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-center transition-colors focus-within:ring-3 aria-disabled:pointer-events-none aria-disabled:opacity-50'
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            if (!props.disabled) void addFiles(event.dataTransfer.files)
          }}
        >
          <HugeiconsIcon
            icon={ImageUpload01Icon}
            strokeWidth={1.7}
            className='text-muted-foreground size-4'
          />
          <span className='text-xs font-medium'>
            {t('Drag images here or click to upload')}
          </span>
          <span className='text-muted-foreground hidden text-xs sm:inline'>
            {t('Supports up to 4 images')}
          </span>
        </label>
      )}
      <input
        ref={inputRef}
        id='draw-reference-images'
        type='file'
        accept='image/*'
        multiple
        disabled={props.disabled}
        className='sr-only'
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files)
        }}
      />
    </div>
  )
}
