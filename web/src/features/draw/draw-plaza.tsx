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
import { Download04Icon, MagicWand01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { t } from 'i18next'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useMediaQuery } from '@/hooks'
import { useAuthStore } from '@/stores/auth-store'

import {
  clearDrawingHistory,
  deleteDrawImage,
  fetchDrawImageBlob,
  generateImages,
  getDrawingHistory,
  getDrawingModels,
  getDrawingTokens,
  imageExtensionFromMimeType,
  isProtectedDrawImageUrl,
} from './api'
import { DrawImage } from './components/draw-image'
import { GenerationHistory } from './components/generation-history'
import { ImageLightbox } from './components/image-lightbox'
import { ReferenceImageUploader } from './components/reference-image-uploader'
import type {
  DrawingToken,
  GenerateImagesInput,
  GenerationRecord,
  GeneratedImage,
  ReferenceImage,
} from './types'

const IMAGE_COUNTS = [1, 2, 3, 4]
const DEFAULT_DRAWING_MODEL = 'gpt-image-2'
const EMPTY_MODELS: string[] = []
const EMPTY_TOKENS: DrawingToken[] = []
type GenerationRequest = GenerateImagesInput

async function downloadImage(image: GeneratedImage) {
  let href = image.src
  let filename = `generated-image-${image.id}.png`
  let revokeUrl: string | null = null

  // Protected images need the auth header, so download them through the
  // authenticated client and hand the browser a blob URL.
  if (isProtectedDrawImageUrl(image.src)) {
    try {
      const blob = await fetchDrawImageBlob(image.src)
      revokeUrl = URL.createObjectURL(blob)
      href = revokeUrl
      filename = `generated-image-${image.id}.${imageExtensionFromMimeType(
        blob.type
      )}`
    } catch {
      toast.error(t('Failed to download image'))
      return
    }
  }

  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  if (!revokeUrl) {
    anchor.target = '_blank'
    anchor.rel = 'noreferrer'
  }
  anchor.click()
  if (revokeUrl) {
    window.setTimeout(() => URL.revokeObjectURL(revokeUrl), 60_000)
  }
}

export function DrawPlaza() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const isStackedLayout = useMediaQuery('(max-width: 1279px)')
  const [prompt, setPrompt] = useState('')
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [imageCount, setImageCount] = useState(1)
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const [activeStackedTab, setActiveStackedTab] = useState<
    'generation' | 'history'
  >('generation')
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null)

  const tokensQuery = useQuery({
    queryKey: ['drawing-tokens', userId],
    queryFn: getDrawingTokens,
    enabled: Boolean(userId),
  })
  const tokens = tokensQuery.data ?? EMPTY_TOKENS
  const tokenId =
    selectedTokenId && tokens.some((token) => token.id === selectedTokenId)
      ? selectedTokenId
      : (tokens[0]?.id ?? null)
  const tokenItems = useMemo(
    () =>
      tokens.map((token) => ({
        label: `${token.name} (#${token.id})`,
        value: String(token.id),
      })),
    [tokens]
  )

  const modelsQuery = useQuery({
    queryKey: ['drawing-models', userId, tokenId],
    queryFn: () => getDrawingModels(tokenId as number),
    enabled: Boolean(userId && tokenId),
  })
  const models = modelsQuery.data ?? EMPTY_MODELS
  const defaultModel = models.includes(DEFAULT_DRAWING_MODEL)
    ? DEFAULT_DRAWING_MODEL
    : (models[0] ?? '')
  const model =
    selectedModel && models.includes(selectedModel)
      ? selectedModel
      : defaultModel
  const modelItems = useMemo(
    () => models.map((item) => ({ label: item, value: item })),
    [models]
  )

  const historyQuery = useQuery({
    queryKey: ['drawing-history', userId],
    queryFn: getDrawingHistory,
    enabled: Boolean(userId),
  })

  const handleRefreshHistory = async () => {
    await historyQuery.refetch()
  }

  const handleDeleteImage = async (imageId: string) => {
    try {
      await deleteDrawImage(imageId)
      setRecords((current) =>
        current
          .map((record) => ({
            ...record,
            images: record.images.filter((image) => image.id !== imageId),
          }))
          .filter(
            (record) =>
              record.status !== 'completed' || record.images.length > 0
          )
      )
      queryClient.setQueryData(
        ['drawing-history', userId],
        (current: GenerationRecord[] | undefined) =>
          (current ?? [])
            .map((record) => ({
              ...record,
              images: record.images.filter((image) => image.id !== imageId),
            }))
            .filter((record) => record.images.length > 0)
      )
      toast.success(t('Image deleted'))
    } catch (error) {
      toast.error(
        error instanceof Error ? t(error.message) : t('Failed to delete image')
      )
    }
  }

  useEffect(() => {
    if (!historyQuery.data) return
    setRecords((current) => {
      const serverRecordIds = new Set(
        historyQuery.data.map((record) => record.id)
      )
      const localRecords = current.filter(
        (record) =>
          record.status !== 'completed' || !serverRecordIds.has(record.id)
      )
      return [...localRecords, ...historyQuery.data]
    })
  }, [historyQuery.data])

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error(t('Please enter an image prompt'))
      return
    }
    if (!tokenId) {
      toast.error(t('No enabled API keys found. Create or enable one first.'))
      return
    }
    if (!model) {
      toast.error(t('No models available'))
      return
    }
    const request: GenerationRequest = {
      tokenId,
      model,
      prompt: prompt.trim(),
      count: imageCount,
      referenceImages: [...referenceImages],
    }
    const recordId = crypto.randomUUID()
    setRecords((current) => [
      {
        id: recordId,
        prompt: request.prompt,
        model: request.model,
        createdAt: Date.now(),
        status: 'queued',
        images: [],
      },
      ...current,
    ])

    void (async () => {
      setRecords((current) =>
        current.map((record) =>
          record.id === recordId ? { ...record, status: 'generating' } : record
        )
      )
      try {
        const images = await generateImages(request)
        setRecords((current) =>
          current.map((record) =>
            record.id === recordId
              ? { ...record, status: 'completed', images }
              : record
          )
        )
        toast.success(t('Generated {{count}} images', { count: images.length }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Generation failed'
        setRecords((current) =>
          current.map((record) =>
            record.id === recordId
              ? { ...record, status: 'failed', error: message }
              : record
          )
        )
        toast.error(t(message))
      }
    })()
  }

  const generatedImages = useMemo(
    () => records.flatMap((record) => record.images),
    [records]
  )
  const inProgressCount = useMemo(
    () =>
      records.filter(
        (record) => record.status === 'queued' || record.status === 'generating'
      ).length,
    [records]
  )

  const workspace = (
    <section
      data-testid='draw-workspace'
      className='bg-card ring-foreground/10 flex h-full min-w-0 flex-col overflow-hidden rounded-xl ring-1'
    >
      <header className='flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3'>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-[10px] font-semibold tracking-[0.2em] uppercase'>
            {t('Image Playground')}
          </p>
          <h1 className='mt-1 text-lg font-semibold'>
            {t('Image Generation')}
          </h1>
        </div>
        <div className='grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:max-w-2xl'>
          <label className='min-w-0'>
            <span className='text-muted-foreground mb-1 block text-[10px] font-medium'>
              {t('API key')}
            </span>
            <Select
              items={tokenItems}
              value={tokenId ? String(tokenId) : ''}
              onValueChange={(value) => {
                setSelectedTokenId(value ? Number(value) : null)
                setSelectedModel('')
              }}
              disabled={tokensQuery.isLoading || tokens.length === 0}
            >
              <SelectTrigger
                size='sm'
                className='w-full'
                aria-label={t('API key')}
              >
                <SelectValue>
                  {(value: string | null) => {
                    const selectedToken = tokens.find(
                      (token) => String(token.id) === value
                    )
                    return selectedToken
                      ? `${selectedToken.name} (#${selectedToken.id})`
                      : t('No API key yet')
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align='start' alignItemWithTrigger={false}>
                <SelectGroup>
                  {tokens.map((token) => (
                    <SelectItem key={token.id} value={String(token.id)}>
                      {token.name} (#{token.id})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className='min-w-0'>
            <span className='text-muted-foreground mb-1 block text-[10px] font-medium'>
              {t('Model')}
            </span>
            <Select
              items={modelItems}
              value={model}
              onValueChange={(value) => setSelectedModel(value ?? '')}
              disabled={
                !tokenId || modelsQuery.isLoading || models.length === 0
              }
            >
              <SelectTrigger
                size='sm'
                className='w-full'
                aria-label={t('Model')}
              >
                <SelectValue>
                  {(value: string | null) => value || t('No models available')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align='start' alignItemWithTrigger={false}>
                <SelectGroup>
                  {models.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>
      </header>

      <div className='flex flex-col gap-3 overflow-y-auto p-3 xl:min-h-0 xl:flex-1'>
        <Card size='sm' className='shrink-0 overflow-visible'>
          <CardHeader>
            <CardTitle>{t('Prompt')}</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] md:items-start'>
            <Textarea
              value={prompt}
              aria-label={t('Describe the image you want to create')}
              placeholder={t(
                'Describe the scene, subject, style, lighting, and mood...'
              )}
              className='min-h-24 resize-none'
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  handleGenerate()
                }
              }}
            />
            <div className='min-w-0'>
              <ReferenceImageUploader
                images={referenceImages}
                disabled={false}
                onChange={setReferenceImages}
              />
            </div>
          </CardContent>
        </Card>

        {tokensQuery.isError && (
          <p className='text-destructive text-sm'>
            {t('Failed to load API keys')}
          </p>
        )}
        {modelsQuery.isError && (
          <p className='text-destructive text-sm'>
            {t('Failed to load models')}
          </p>
        )}

        {generatedImages.length > 0 && (
          <div className='flex flex-wrap gap-2.5'>
            {generatedImages.map((image) => (
              <Card
                key={image.id}
                className='group relative size-36 shrink-0 cursor-zoom-in py-0 sm:size-40 xl:size-44'
                onClick={() => setPreviewImage(image)}
              >
                <DrawImage
                  src={image.src}
                  alt={t('Generated image')}
                  className='aspect-square size-full object-cover'
                />
                <Button
                  type='button'
                  size='icon-sm'
                  variant='secondary'
                  aria-label={t('Download image')}
                  className='absolute top-1.5 right-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
                  onClick={(event) => {
                    event.stopPropagation()
                    downloadImage(image)
                  }}
                >
                  <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div
        data-testid='draw-action-bar'
        className='bg-card/80 shrink-0 border-t px-3 py-2.5'
      >
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              disabled={
                !prompt.trim() ||
                !tokenId ||
                !model ||
                tokensQuery.isError ||
                modelsQuery.isError
              }
              onClick={handleGenerate}
            >
              <HugeiconsIcon
                icon={MagicWand01Icon}
                strokeWidth={2}
                data-icon='inline-start'
              />
              {t('Start generating')}
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={() => {
                setPrompt('')
                setReferenceImages([])
              }}
            >
              {t('Clear')}
            </Button>
          </div>
          <div
            className='flex flex-wrap items-center gap-1'
            role='group'
            aria-label={t('Image count')}
          >
            {IMAGE_COUNTS.map((count) => (
              <Button
                key={count}
                type='button'
                size='xs'
                variant={imageCount === count ? 'secondary' : 'ghost'}
                aria-pressed={imageCount === count}
                onClick={() => setImageCount(count)}
              >
                {count === 1 ? t('1 image') : t('{{count}} images', { count })}
              </Button>
            ))}
          </div>
        </div>
        <div className='grid grid-cols-3 gap-3 pt-2'>
          <div>
            <p className='text-muted-foreground text-[10px]'>{t('Status')}</p>
            <p className='mt-0.5 text-xs font-medium'>
              {inProgressCount > 0
                ? t('{{count}} in progress', { count: inProgressCount })
                : t('Ready')}
            </p>
          </div>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-[10px]'>{t('Model')}</p>
            <p className='mt-0.5 truncate text-xs font-medium'>
              {model || '—'}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-[10px]'>
              {t('Reference images')}
            </p>
            <p className='mt-0.5 text-xs font-medium tabular-nums'>
              {referenceImages.length}
            </p>
          </div>
        </div>
      </div>
    </section>
  )

  const history = (
    <GenerationHistory
      records={records}
      onPreview={setPreviewImage}
      isRefreshing={historyQuery.isFetching}
      onRefresh={handleRefreshHistory}
      onDeleteImage={handleDeleteImage}
      onClear={async () => {
        try {
          await clearDrawingHistory()
          setRecords((current) =>
            current.filter(
              (record) =>
                record.status === 'queued' || record.status === 'generating'
            )
          )
          queryClient.setQueryData(['drawing-history', userId], [])
          toast.success(t('Generation history cleared'))
        } catch (error) {
          toast.error(
            error instanceof Error
              ? t(error.message)
              : t('Failed to clear generation history')
          )
        }
      }}
    />
  )

  const lightbox = (
    <ImageLightbox image={previewImage} onClose={() => setPreviewImage(null)} />
  )

  if (isStackedLayout) {
    return (
      <div
        data-testid='draw-stacked-layout'
        className='bg-muted/35 size-full min-h-0 p-3'
      >
        <Tabs
          value={activeStackedTab}
          onValueChange={(value) =>
            setActiveStackedTab(value as 'generation' | 'history')
          }
          className='size-full min-h-0'
        >
          <TabsList className='mx-auto grid w-full max-w-sm grid-cols-2'>
            <TabsTrigger value='generation'>
              {t('Image Generation')}
            </TabsTrigger>
            <TabsTrigger value='history'>{t('History')}</TabsTrigger>
          </TabsList>
          <TabsContent value='generation' className='min-h-0'>
            {workspace}
          </TabsContent>
          <TabsContent value='history' className='min-h-0'>
            {history}
          </TabsContent>
        </Tabs>
        {lightbox}
      </div>
    )
  }

  return (
    <div className='bg-muted/35 size-full min-h-0 p-3'>
      <ResizablePanelGroup
        id='draw-plaza-panels'
        data-testid='draw-resizable-layout'
        orientation='horizontal'
        className='min-h-0'
      >
        <ResizablePanel
          id='draw-generation-panel'
          defaultSize='68'
          minSize='480px'
        >
          {workspace}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label={t('Resize generation and history panels')}
          className='mx-2 w-1 bg-transparent after:w-3'
        />
        <ResizablePanel
          id='draw-history-resizable-panel'
          defaultSize='32'
          minSize='280px'
          maxSize='50%'
        >
          {history}
        </ResizablePanel>
      </ResizablePanelGroup>
      {lightbox}
    </div>
  )
}
