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
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { api } from '@/lib/api'

import {
  fetchDrawImageBlob,
  generateImages,
  getDrawingHistory,
  getDrawingModels,
  getDrawingTokens,
  imageExtensionFromMimeType,
  isProtectedDrawImageUrl,
} from '../api'

const originalApiGet = api.get
const originalApiPost = api.post

afterEach(() => {
  api.get = originalApiGet
  api.post = originalApiPost
})

describe('drawing API', () => {
  test('lists every enabled token without exposing its real key', async () => {
    api.get = (async (url: string) => {
      const isSecondPage = url.includes('p=2')
      return {
        data: {
          success: true,
          data: {
            items: isSecondPage
              ? [{ id: 3, name: 'exhausted', status: 4, key: 'masked' }]
              : [
                  { id: 1, name: 'enabled', status: 1, key: 'masked' },
                  { id: 2, name: 'disabled', status: 2, key: 'masked' },
                ],
            total: 3,
            page: isSecondPage ? 2 : 1,
            page_size: 2,
          },
        },
      }
    }) as typeof api.get

    const tokens = await getDrawingTokens()

    assert.deepEqual(tokens, [{ id: 1, name: 'enabled' }])
    const firstToken = tokens[0]
    assert.ok(firstToken)
    assert.equal('key' in firstToken, false)
  })

  test('uses the selected token and returns only image-generation models', async () => {
    api.get = (async (url: string, config?: { headers?: HeadersInit }) => {
      assert.equal(url, '/api/draw/models')
      assert.equal(new Headers(config?.headers).get('X-Draw-Token-Id'), '37')
      return {
        data: {
          success: true,
          data: [
            {
              id: 'chat-only',
              supported_endpoint_types: ['openai'],
            },
            {
              id: 'image-beta',
              supported_endpoint_types: ['openai'],
            },
            {
              id: 'image-alpha',
              supported_endpoint_types: ['openai', 'image-generation'],
            },
            {
              id: 'gpt-image-2',
              supported_endpoint_types: ['openai'],
            },
            {
              id: 'missing-metadata',
            },
          ],
        },
      }
    }) as typeof api.get

    const models = await getDrawingModels(37)

    assert.deepEqual(models, ['gpt-image-2', 'image-alpha', 'image-beta'])
  })

  test('generates through the session proxy without retrieving the real key', async () => {
    api.post = (async (
      url: string,
      data: object,
      config?: { headers?: HeadersInit }
    ) => {
      assert.equal(url, '/api/draw/generations')
      assert.equal(new Headers(config?.headers).get('X-Draw-Token-Id'), '37')
      assert.equal('tokenId' in data, false)
      assert.deepEqual(data, {
        model: 'image-alpha',
        prompt: 'a lighthouse',
        n: 1,
      })
      return {
        data: {
          data: [
            { url: 'javascript:alert(document.cookie)' },
            { url: '/api/draw/images/saved-image' },
          ],
        },
      }
    }) as typeof api.post

    const images = await generateImages({
      tokenId: 37,
      model: 'image-alpha',
      prompt: 'a lighthouse',
      count: 1,
      referenceImages: [],
    })

    assert.equal(images.length, 1)
    assert.equal(images[0]?.src, '/api/draw/images/saved-image')
  })

  test('restores server-timed history with millisecond timestamps', async () => {
    api.get = (async (url: string) => {
      assert.equal(url, '/api/draw/history')
      return {
        data: {
          success: true,
          data: [
            {
              id: 'generation-1',
              prompt: 'a lighthouse',
              model: 'gpt-image-2',
              created_at: 1_700_000_000,
              expires_at: 1_700_086_400,
              images: [
                {
                  id: 'image-1',
                  src: '/api/draw/images/image-1',
                },
              ],
            },
          ],
        },
      }
    }) as typeof api.get

    const records = await getDrawingHistory()

    assert.equal(records[0]?.status, 'completed')
    assert.equal(records[0]?.createdAt, 1_700_000_000_000)
    assert.equal(records[0]?.expiresAt, 1_700_086_400_000)
  })

  test('fetches protected generated images through the authenticated client', async () => {
    const calls: Array<{ url: string; responseType?: string }> = []
    api.get = (async (url: string, config?: { responseType?: string }) => {
      calls.push({ url, responseType: config?.responseType })
      if (url === '/api/draw/images/image-1') {
        return { data: new Blob(['png-bytes'], { type: 'image/png' }) }
      }
      throw new Error(`unexpected URL: ${url}`)
    }) as typeof api.get

    const blob = await fetchDrawImageBlob('/api/draw/images/image-1')

    assert.ok(blob instanceof Blob)
    assert.equal(blob.type, 'image/png')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, '/api/draw/images/image-1')
    assert.equal(calls[0]?.responseType, 'blob')
  })

  test('rejects non-protected sources in the authenticated image fetch', async () => {
    let getCalls = 0
    api.get = (async () => {
      getCalls += 1
      return { data: new Blob([]) }
    }) as typeof api.get

    await assert.rejects(
      () => fetchDrawImageBlob('https://example.com/image.png'),
      /Invalid generated image URL/
    )
    assert.equal(getCalls, 0)
  })

  test('maps image mime types to download extensions', () => {
    assert.equal(imageExtensionFromMimeType('image/png'), 'png')
    assert.equal(imageExtensionFromMimeType('image/jpeg'), 'jpg')
    assert.equal(imageExtensionFromMimeType('image/webp'), 'webp')
    assert.equal(imageExtensionFromMimeType('image/gif'), 'gif')
    assert.equal(imageExtensionFromMimeType('image/avif'), 'avif')
    assert.equal(imageExtensionFromMimeType('application/octet-stream'), 'png')
  })

  test('recognizes protected draw image URLs', () => {
    assert.equal(isProtectedDrawImageUrl('/api/draw/images/abc'), true)
    assert.equal(isProtectedDrawImageUrl('https://example.com/a.png'), false)
    assert.equal(isProtectedDrawImageUrl('data:image/png;base64,AAAA'), false)
  })
})
