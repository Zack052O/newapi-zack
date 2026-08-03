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
import axios from 'axios'

import { getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import { api } from '@/lib/api'

import type {
  DrawingToken,
  GenerateImagesInput,
  GeneratedImage,
  GenerationRecord,
} from './types'

const DRAWING_TOKEN_PAGE_SIZE = 100
const DEFAULT_DRAWING_MODEL = 'gpt-image-2'
const IMAGE_GENERATION_ENDPOINT = 'image-generation'

type ImageResponseItem = {
  url?: string
  b64_json?: string
}

type ImageGenerationResponse = {
  data?: ImageResponseItem[]
  error?: { message?: string }
  message?: string
}

type ModelResponseItem = {
  id?: string
  supported_endpoint_types?: string[]
}

type ModelListResponse = {
  success?: boolean
  data?: ModelResponseItem[]
  error?: { message?: string }
  message?: string
}

type DrawHistoryResponse = {
  success?: boolean
  data?: Array<{
    id: string
    prompt: string
    model: string
    created_at: number
    expires_at: number
    images: GeneratedImage[]
  }>
  message?: string
}

function validateTokenId(tokenId: number): void {
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) {
    throw new Error('Invalid API key')
  }
}

function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback
  }
  const responseData = error.response?.data as
    | { error?: { message?: string }; message?: string }
    | undefined
  return responseData?.error?.message || responseData?.message || fallback
}

function getSafeRemoteImageUrl(value: string): string {
  if (value.startsWith('/api/draw/images/')) {
    return value
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

// Generated images are served from /api/draw/images/:id, which requires the
// dashboard Authorization header that plain <img> tags cannot send. Anything
// starting with this prefix must be fetched through the authenticated client
// and converted to a blob URL before it can be previewed or downloaded.
export function isProtectedDrawImageUrl(src: string): boolean {
  return src.startsWith('/api/draw/images/')
}

export async function fetchDrawImageBlob(src: string): Promise<Blob> {
  if (!isProtectedDrawImageUrl(src)) {
    throw new Error('Invalid generated image URL')
  }
  const response = await api.get(src, {
    responseType: 'blob',
    skipErrorHandler: true,
  })
  const blob = response.data as Blob | undefined
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('Failed to load generated image')
  }
  return blob
}

export function imageExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/avif':
      return 'avif'
    default:
      return 'png'
  }
}

export async function getDrawingTokens(): Promise<DrawingToken[]> {
  const tokens: DrawingToken[] = []
  let page = 1

  while (true) {
    const response = await getApiKeys({
      p: page,
      size: DRAWING_TOKEN_PAGE_SIZE,
    })
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load API keys')
    }

    for (const token of response.data.items) {
      if (token.status === API_KEY_STATUS.ENABLED) {
        tokens.push({ id: token.id, name: token.name })
      }
    }

    const loaded = page * response.data.page_size
    if (
      response.data.items.length === 0 ||
      loaded >= response.data.total ||
      response.data.items.length < response.data.page_size
    ) {
      break
    }
    page += 1
  }

  return tokens
}

export async function getDrawingModels(tokenId: number): Promise<string[]> {
  validateTokenId(tokenId)
  let payload: ModelListResponse
  try {
    const response = await api.get('/api/draw/models', {
      headers: { 'X-Draw-Token-Id': String(tokenId) },
      skipErrorHandler: true,
    })
    payload = response.data as ModelListResponse
  } catch (error) {
    throw new Error(getRequestErrorMessage(error, 'Failed to load models'))
  }
  if (payload.success === false) {
    throw new Error(
      payload.error?.message || payload.message || 'Failed to load models'
    )
  }

  if (!Array.isArray(payload.data)) {
    throw new Error('Failed to load models')
  }

  const models = payload.data
  return [
    ...new Set(
      models.flatMap((model) => {
        const supportsImages = model.supported_endpoint_types?.includes(
          IMAGE_GENERATION_ENDPOINT
        )
        const hasImageName = model.id?.toLowerCase().includes('image')
        return model.id && (supportsImages || hasImageName) ? [model.id] : []
      })
    ),
  ].sort((left, right) => {
    if (left === DEFAULT_DRAWING_MODEL) return -1
    if (right === DEFAULT_DRAWING_MODEL) return 1
    return left.localeCompare(right)
  })
}

export async function generateImages(
  input: GenerateImagesInput
): Promise<GeneratedImage[]> {
  validateTokenId(input.tokenId)
  let payload: ImageGenerationResponse
  try {
    const response = await api.post(
      '/api/draw/generations',
      {
        model: input.model,
        prompt: input.prompt,
        n: input.count,
        ...(input.referenceImages.length > 0
          ? { images: input.referenceImages.map((image) => image.dataUrl) }
          : {}),
      },
      {
        headers: { 'X-Draw-Token-Id': String(input.tokenId) },
        skipErrorHandler: true,
      }
    )
    payload = response.data as ImageGenerationResponse
  } catch (error) {
    throw new Error(getRequestErrorMessage(error, 'Generation failed'))
  }

  const images = (payload.data ?? []).flatMap((image) => {
    let src = ''
    if (image.url) {
      src = getSafeRemoteImageUrl(image.url)
    } else if (image.b64_json) {
      src = `data:image/png;base64,${image.b64_json}`
    }
    return src ? [{ id: crypto.randomUUID(), src }] : []
  })

  if (images.length === 0) {
    throw new Error('No image data returned')
  }

  return images
}

export async function getDrawingHistory(): Promise<GenerationRecord[]> {
  let payload: DrawHistoryResponse
  try {
    const response = await api.get('/api/draw/history', {
      skipErrorHandler: true,
      disableDuplicate: true,
    })
    payload = response.data as DrawHistoryResponse
  } catch (error) {
    throw new Error(
      getRequestErrorMessage(error, 'Failed to load generation history')
    )
  }
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error(payload.message || 'Failed to load generation history')
  }
  return payload.data.map((record) => ({
    id: record.id,
    prompt: record.prompt,
    model: record.model,
    createdAt: record.created_at * 1000,
    expiresAt: record.expires_at * 1000,
    status: 'completed',
    images: record.images,
  }))
}

export async function clearDrawingHistory(): Promise<void> {
  try {
    const response = await api.delete('/api/draw/history', {
      skipErrorHandler: true,
    })
    if (response.data?.success !== true) {
      throw new Error(
        response.data?.message || 'Failed to clear generation history'
      )
    }
  } catch (error) {
    throw new Error(
      getRequestErrorMessage(error, 'Failed to clear generation history')
    )
  }
}

export async function deleteDrawImage(imageId: string): Promise<void> {
  try {
    const response = await api.delete(
      `/api/draw/images/${encodeURIComponent(imageId)}`,
      { skipErrorHandler: true }
    )
    if (response.data?.success !== true) {
      throw new Error(response.data?.message || 'Failed to delete image')
    }
  } catch (error) {
    throw new Error(getRequestErrorMessage(error, 'Failed to delete image'))
  }
}
