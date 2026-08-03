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
import {
  Clock01Icon,
  Delete01Icon,
  Image01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'

import type { GeneratedImage, GenerationRecord } from '../types'
import { DrawImage } from './draw-image'

type GenerationHistoryProps = {
  records: GenerationRecord[]
  isRefreshing?: boolean
  onPreview: (image: GeneratedImage) => void
  onRefresh: () => Promise<void> | void
  onClear: () => Promise<void>
  onDeleteImage: (imageId: string) => Promise<void> | void
}

function GenerationStatusBadge(props: { status: GenerationRecord['status'] }) {
  const { t } = useTranslation()
  if (props.status === 'failed') {
    return <Badge variant='destructive'>{t('Failed')}</Badge>
  }
  if (props.status === 'completed') {
    return <Badge variant='secondary'>{t('Completed')}</Badge>
  }
  if (props.status === 'queued') {
    return <Badge variant='outline'>{t('Queued')}</Badge>
  }
  return <Badge variant='warning'>{t('Generating...')}</Badge>
}

type HistoryImageThumbnailProps = {
  image: GeneratedImage
  deleting: boolean
  onPreview: (image: GeneratedImage) => void
  onDelete: (imageId: string) => Promise<void> | void
}

function HistoryImageThumbnail(props: HistoryImageThumbnailProps) {
  const { t } = useTranslation()
  return (
    <div className='group relative size-full overflow-hidden rounded-md ring-1 ring-black/10'>
      <button
        type='button'
        aria-label={t('Preview image')}
        className='block size-full cursor-zoom-in p-0'
        onClick={() => props.onPreview(props.image)}
      >
        <DrawImage
          src={props.image.src}
          alt={t('Generated image')}
          className='size-full object-cover'
        />
      </button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type='button'
              size='icon-xs'
              variant='secondary'
              aria-label={t('Delete image')}
              disabled={props.deleting}
              className='absolute top-0.5 right-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
            />
          }
        >
          <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete this image?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This image will be removed from history.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.deleting}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={props.deleting}
              onClick={() => void props.onDelete(props.image.id)}
            >
              {props.deleting ? t('Deleting...') : t('Delete image')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function GenerationHistory(props: GenerationHistoryProps) {
  const { t } = useTranslation()
  const [isClearing, setIsClearing] = useState(false)
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const readyCount = props.records.reduce(
    (total, record) => total + record.images.length,
    0
  )
  const inProgressCount = props.records.filter(
    (record) => record.status === 'queued' || record.status === 'generating'
  ).length

  const handleDeleteImage = async (imageId: string) => {
    setDeletingImageId(imageId)
    try {
      await props.onDeleteImage(imageId)
    } finally {
      setDeletingImageId(null)
    }
  }

  return (
    <aside
      data-testid='draw-history-panel'
      className='bg-card ring-foreground/10 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl ring-1'
    >
      <header className='flex items-start justify-between gap-3 border-b px-4 py-3'>
        <div>
          <p className='text-muted-foreground text-[10px] font-semibold tracking-[0.2em] uppercase'>
            {t('History')}
          </p>
          <h2 className='text-base font-semibold'>{t('History')}</h2>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='icon-xs'
            aria-label={t('Refresh')}
            title={t('Refresh')}
            disabled={props.isRefreshing}
            onClick={() => {
              void props.onRefresh()
            }}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              className={props.isRefreshing ? 'animate-spin' : undefined}
            />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type='button'
                  variant='outline'
                  size='xs'
                  disabled={props.records.length === 0 || isClearing}
                />
              }
            >
              {t('Clear')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('Clear generation history?')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'This will delete all generated images in history. Active requests will continue.'
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearing}>
                  {t('Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  disabled={isClearing}
                  onClick={async () => {
                    setIsClearing(true)
                    try {
                      await props.onClear()
                    } finally {
                      setIsClearing(false)
                    }
                  }}
                >
                  {isClearing ? t('Clearing...') : t('Clear history')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className='grid grid-cols-3 gap-2 p-3'>
        <div className='bg-muted/35 ring-foreground/10 rounded-lg p-2 ring-1'>
          <p className='text-muted-foreground text-[10px]'>
            {t('Total requests')}
          </p>
          <p className='mt-1 text-sm font-semibold tabular-nums'>
            {props.records.length}
          </p>
        </div>
        <div className='bg-primary/5 ring-primary/20 rounded-lg p-2 ring-1'>
          <p className='text-muted-foreground text-[10px]'>
            {t('In Progress')}
          </p>
          <p className='mt-1 text-sm font-semibold tabular-nums'>
            {inProgressCount}
          </p>
        </div>
        <div className='bg-muted/35 ring-foreground/10 rounded-lg p-2 ring-1'>
          <p className='text-muted-foreground text-[10px]'>
            {t('Images ready')}
          </p>
          <p className='mt-1 text-sm font-semibold tabular-nums'>
            {readyCount}
          </p>
        </div>
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        {props.records.length === 0 ? (
          <Empty className='min-h-56 border-0'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} />
              </EmptyMedia>
              <EmptyTitle>{t('No generation history yet')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='flex flex-col gap-2 px-3 pb-3'>
            {props.records.map((record) => (
              <article
                key={record.id}
                className='ring-foreground/10 grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg p-2 ring-1'
              >
                <div className='bg-muted relative aspect-square overflow-hidden rounded-md'>
                  {record.images[0] ? (
                    <HistoryImageThumbnail
                      image={record.images[0]}
                      deleting={deletingImageId === record.images[0].id}
                      onPreview={props.onPreview}
                      onDelete={handleDeleteImage}
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Image01Icon}
                      strokeWidth={1.7}
                      className='text-muted-foreground absolute inset-0 m-auto size-5'
                    />
                  )}
                </div>
                <div className='min-w-0'>
                  <p className='line-clamp-2 text-xs font-medium'>
                    {record.prompt}
                  </p>
                  <p className='text-muted-foreground mt-1 truncate text-[10px]'>
                    {record.model}
                  </p>
                  {record.error && (
                    <p className='text-destructive mt-1 line-clamp-2 text-[10px]'>
                      {t(record.error)}
                    </p>
                  )}
                  <div className='mt-1.5 flex items-center justify-between gap-2'>
                    <GenerationStatusBadge status={record.status} />
                    <span className='text-muted-foreground text-[10px] tabular-nums'>
                      {new Date(record.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {record.images.length > 1 && (
                    <div className='mt-2 flex flex-wrap gap-1.5'>
                      {record.images.slice(1).map((image) => (
                        <div key={image.id} className='size-12'>
                          <HistoryImageThumbnail
                            image={image}
                            deleting={deletingImageId === image.id}
                            onPreview={props.onPreview}
                            onDelete={handleDeleteImage}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
