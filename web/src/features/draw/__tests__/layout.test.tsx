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
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

import { api, type ApiRequestConfig } from '@/lib/api'

const domWindow = new Window()
let isCompactViewport = false
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'KeyboardEvent',
  'PointerEvent',
  'MouseEvent',
  'FocusEvent',
  'CustomEvent',
  'FileReader',
  'MutationObserver',
  'ResizeObserver',
  'DOMRect',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

Object.defineProperty(domWindow, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: query === '(max-width: 1279px)' && isCompactViewport,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }),
})

Object.defineProperty(domWindow.Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { DrawPlaza } = await import('../draw-plaza')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('draw plaza layout', () => {
  after(() => {
    domWindow.close()
  })

  test('shows token-scoped image models in a resizable desktop workspace', async () => {
    isCompactViewport = false
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [
        { id: 17, name: 'Primary image token' },
        { id: 29, name: 'Backup image token' },
      ],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['image-model-from-database', 'gpt-image-2', 'gpt-image-current'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const workspace = container.querySelector('[data-testid="draw-workspace"]')
    const history = container.querySelector(
      '[data-testid="draw-history-panel"]'
    )
    const modelSelector = container.querySelector('[aria-label="Model"]')
    const tokenSelector = container.querySelector('[aria-label="API key"]')
    const resizableLayout = container.querySelector(
      '[data-slot="resizable-panel-group"]'
    )
    const resizeHandle = container.querySelector(
      '[aria-label="Resize generation and history panels"]'
    )
    const referenceUploader = container.querySelector(
      '[data-testid="reference-image-uploader"]'
    )
    const uploadDropZone = container.querySelector(
      'label[for="draw-reference-images"][aria-disabled]'
    )

    assert.ok(workspace)
    assert.ok(history)
    assert.ok(tokenSelector)
    assert.ok(modelSelector)
    assert.ok(resizableLayout)
    assert.ok(resizeHandle)
    assert.ok(referenceUploader)
    assert.equal(referenceUploader.classList.contains('min-h-36'), false)
    const promptCard = container.querySelector(
      '[data-testid="draw-workspace"] [data-slot="card"]'
    )
    assert.ok(promptCard)
    const promptCardContent = promptCard.querySelector(
      '[data-slot="card-content"]'
    )
    assert.ok(promptCardContent)
    assert.ok(
      promptCardContent.classList.contains(
        'md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)]'
      )
    )
    const actionBar = container.querySelector('[data-testid="draw-action-bar"]')
    assert.ok(actionBar)
    assert.equal(actionBar.classList.contains('shrink-0'), true)
    assert.equal(workspace?.contains(actionBar), true)
    const generateButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Start generating')
    )
    assert.ok(generateButton)
    assert.equal(promptCard.contains(generateButton), false)
    assert.equal(actionBar.contains(generateButton), true)
    assert.ok(uploadDropZone)
    assert.ok(uploadDropZone.classList.contains('min-h-14'))
    assert.ok(uploadDropZone.classList.contains('flex-row'))
    assert.ok(uploadDropZone.classList.contains('shrink-0'))
    assert.equal(
      tokenSelector.textContent?.includes('Primary image token'),
      true
    )
    assert.equal(modelSelector.textContent?.includes('gpt-image-2'), true)
    assert.equal(container.textContent?.includes('Generated images'), false)
    assert.equal(
      container.textContent?.includes(
        'Your generated images will appear here.'
      ),
      false
    )
    assert.equal(container.textContent?.includes('Configuration'), false)
    assert.equal(container.textContent?.includes('Prompt templates'), false)
    assert.equal(container.textContent?.includes('Batch submit'), false)

    const imageCountGroup = container.querySelector(
      '[role="group"][aria-label="Image count"]'
    )
    assert.ok(imageCountGroup)
    assert.equal(imageCountGroup.querySelectorAll('button').length, 4)

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
  })

  test('stacks generation and history when the viewport is compact', async () => {
    isCompactViewport = true
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-current'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    assert.ok(container.querySelector('[data-testid="draw-stacked-layout"]'))
    assert.equal(
      container.querySelector('[data-slot="resizable-panel-group"]'),
      null
    )
    assert.ok(container.querySelector('[data-testid="draw-workspace"]'))
    assert.equal(
      container.querySelector('[data-testid="draw-history-panel"]'),
      null
    )
    assert.ok(container.querySelector('[data-testid="draw-action-bar"]'))

    const tabTriggers = [
      ...container.querySelectorAll('[data-slot="tabs-trigger"]'),
    ]
    const generationTab = tabTriggers.find((trigger) =>
      trigger.textContent?.includes('Image Generation')
    )
    const historyTab = tabTriggers.find((trigger) =>
      trigger.textContent?.includes('History')
    )
    assert.ok(generationTab)
    assert.ok(historyTab)
    const visibleWorkspace = [
      ...container.querySelectorAll('[data-slot="tabs-content"]'),
    ]
      .find((content) => !content.hasAttribute('hidden'))
      ?.querySelector('[data-testid="draw-workspace"]')
    assert.ok(visibleWorkspace)

    await act(async () => {
      ;(historyTab as HTMLButtonElement).click()
    })
    const visibleHistory = [
      ...container.querySelectorAll('[data-slot="tabs-content"]'),
    ]
      .find((content) => !content.hasAttribute('hidden'))
      ?.querySelector('[data-testid="draw-history-panel"]')
    assert.ok(visibleHistory)
    const visibleWorkspaceAfterSwitch = [
      ...container.querySelectorAll('[data-slot="tabs-content"]'),
    ]
      .find((content) => !content.hasAttribute('hidden'))
      ?.querySelector('[data-testid="draw-workspace"]')
    assert.equal(visibleWorkspaceAfterSwitch, null)

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    isCompactViewport = false
  })

  test('keeps submission controls enabled while multiple requests are generating', async () => {
    isCompactViewport = false
    const originalApiPost = api.post
    const originalApiDelete = api.delete
    const originalApiGet = api.get
    type DrawResponse = {
      data: {
        data: Array<{ url: string }>
      }
    }
    const pendingRequests: Array<(value: DrawResponse) => void> = []
    const mockedPost = () =>
      new Promise<DrawResponse>((resolve) => {
        pendingRequests.push(resolve)
      })
    api.post = mockedPost as unknown as typeof api.post
    api.get = (async (url: string, config?: ApiRequestConfig) => {
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['fake-image'], { type: 'image/png' }) }
      }
      return originalApiGet(url, config)
    }) as typeof api.get

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const promptInput = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Describe the image you want to create"]'
    )
    assert.ok(promptInput)
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      valueSetter?.call(promptInput, 'a lighthouse')
      promptInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const generateButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Start generating')
    )
    assert.ok(generateButton)
    assert.equal(generateButton.disabled, false)
    await act(async () => {
      generateButton.click()
      generateButton.click()
    })

    assert.equal(pendingRequests.length, 2)
    assert.equal(generateButton.disabled, false)
    assert.equal(
      container.querySelector<HTMLInputElement>('#draw-reference-images')
        ?.disabled,
      false
    )
    assert.equal(
      [...container.querySelectorAll('[data-slot="badge"]')].filter((badge) =>
        badge.textContent?.includes('Generating...')
      ).length,
      2
    )

    await act(async () => {
      pendingRequests.forEach((resolve, index) =>
        resolve({
          data: {
            data: [{ url: `/api/draw/images/generated-${index}` }],
          },
        })
      )
      await flushAsyncWork()
    })

    assert.equal(
      container.querySelectorAll('img[alt="Generated image"]').length,
      4
    )
    const generatedCards = [
      ...container.querySelectorAll(
        '[data-testid="draw-workspace"] [data-slot="card"]'
      ),
    ].filter((card) => card.classList.contains('cursor-zoom-in'))
    assert.equal(generatedCards.length, 2)
    for (const card of generatedCards) {
      assert.ok(card.classList.contains('shrink-0'))
      assert.ok(card.classList.contains('size-36'))
    }

    let deleteCalls = 0
    api.delete = (async () => {
      deleteCalls += 1
      return { data: { success: true } }
    }) as typeof api.delete
    const historyPanel = container.querySelector(
      '[data-testid="draw-history-panel"]'
    )
    const clearHistoryTrigger = [
      ...(historyPanel?.querySelectorAll('button') ?? []),
    ].find((button) => button.textContent?.trim() === 'Clear')
    assert.ok(clearHistoryTrigger)
    await act(async () => clearHistoryTrigger.click())
    assert.equal(deleteCalls, 0)

    const confirmClearButton = [
      ...document.body.querySelectorAll('button'),
    ].find((button) => button.textContent?.trim() === 'Clear history')
    assert.ok(confirmClearButton)
    await act(async () => confirmClearButton.click())
    assert.equal(deleteCalls, 1)

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.post = originalApiPost
    api.delete = originalApiDelete
    api.get = originalApiGet
  })

  test('opens a centered preview from generated images and closes on backdrop click', async () => {
    isCompactViewport = false
    const originalApiPost = api.post
    const originalApiGet = api.get
    api.post = (async () => ({
      data: { data: [{ url: '/api/draw/images/preview-result' }] },
    })) as typeof api.post
    api.get = (async (url: string, config?: ApiRequestConfig) => {
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['fake-image'], { type: 'image/png' }) }
      }
      return originalApiGet(url, config)
    }) as typeof api.get

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const promptInput = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Describe the image you want to create"]'
    )
    assert.ok(promptInput)
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      valueSetter?.call(promptInput, 'a lighthouse')
      promptInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const generateButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Start generating')
    )
    assert.ok(generateButton)
    await act(async () => {
      generateButton.click()
      await flushAsyncWork()
    })

    const workspaceGeneratedImage = container.querySelector(
      '[data-testid="draw-workspace"] img[alt="Generated image"]'
    )
    assert.ok(workspaceGeneratedImage)
    const generatedCard = workspaceGeneratedImage.closest('[data-slot="card"]')
    assert.ok(generatedCard)
    await act(async () => {
      ;(generatedCard as HTMLElement).click()
    })

    let lightbox = container.querySelector('[data-testid="image-lightbox"]')
    assert.ok(lightbox)
    assert.ok(lightbox?.querySelector('img[alt="Generated image"]'))
    await act(async () => {
      ;(lightbox as HTMLElement).click()
    })
    assert.equal(
      container.querySelector('[data-testid="image-lightbox"]'),
      null
    )

    const historyPreviewButton = container.querySelector(
      'button[aria-label="Preview image"]'
    )
    assert.ok(historyPreviewButton)
    await act(async () => {
      ;(historyPreviewButton as HTMLButtonElement).click()
    })
    lightbox = container.querySelector('[data-testid="image-lightbox"]')
    assert.ok(lightbox)
    await act(async () => {
      ;(lightbox as HTMLElement).click()
    })
    assert.equal(
      container.querySelector('[data-testid="image-lightbox"]'),
      null
    )

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.post = originalApiPost
    api.get = originalApiGet
  })

  test('downloads the original image through the authenticated client', async () => {
    isCompactViewport = false
    const originalApiPost = api.post
    const originalApiGet = api.get
    const originalAnchorClick = domWindow.HTMLAnchorElement.prototype.click
    const originalWindowSetTimeout = window.setTimeout
    const clickedAnchors: Array<{ download: string; href: string }> = []
    const imageGetCalls: Array<{ url: string; responseType?: string }> = []

    window.setTimeout = (() => 0) as unknown as typeof window.setTimeout
    domWindow.HTMLAnchorElement.prototype.click = function (
      this: HTMLAnchorElement
    ) {
      clickedAnchors.push({ download: this.download, href: this.href })
    }
    api.get = (async (url: string, config?: ApiRequestConfig) => {
      imageGetCalls.push({ url, responseType: config?.responseType })
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['fake-image'], { type: 'image/png' }) }
      }
      return originalApiGet(url, config)
    }) as typeof api.get
    api.post = (async () => {
      return {
        data: { data: [{ url: '/api/draw/images/generated-download' }] },
      }
    }) as typeof api.post

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const promptInput = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Describe the image you want to create"]'
    )
    assert.ok(promptInput)
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      valueSetter?.call(promptInput, 'a lighthouse')
      promptInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const generateButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Start generating')
    )
    assert.ok(generateButton)
    await act(async () => {
      generateButton.click()
      await flushAsyncWork()
    })

    assert.equal(
      container.querySelectorAll('img[alt="Generated image"]').length,
      2
    )

    const downloadButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Download image"]'
    )
    assert.ok(downloadButton)
    await act(async () => {
      downloadButton.click()
      await flushAsyncWork()
    })

    const protectedFetch = imageGetCalls.find((call) =>
      call.url.startsWith('/api/draw/images/')
    )
    assert.ok(protectedFetch)
    assert.equal(protectedFetch.responseType, 'blob')
    assert.equal(clickedAnchors.length, 1)
    const downloaded = clickedAnchors[0]
    assert.ok(downloaded)
    assert.match(downloaded.download, /^generated-image-.+\.png$/)
    assert.equal(downloaded.href.startsWith('blob:'), true)

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.post = originalApiPost
    api.get = originalApiGet
    domWindow.HTMLAnchorElement.prototype.click = originalAnchorClick
    window.setTimeout = originalWindowSetTimeout
  })

  test('refreshes history with a button to the left of Clear', async () => {
    isCompactViewport = false
    const originalApiGet = api.get
    let historyFetchCalls = 0
    api.get = (async (url: string, config?: ApiRequestConfig) => {
      if (url === '/api/draw/history') {
        historyFetchCalls += 1
        return {
          data: {
            success: true,
            data: [
              {
                id: 'generation-refresh',
                prompt: 'a lighthouse',
                model: 'gpt-image-2',
                created_at: 1_700_000_000,
                expires_at: 1_700_086_400,
                images: [
                  {
                    id: 'image-refresh',
                    src: '/api/draw/images/image-refresh',
                  },
                ],
              },
            ],
          },
        }
      }
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['fake-image'], { type: 'image/png' }) }
      }
      return originalApiGet(url, config)
    }) as typeof api.get

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-history', undefined],
      [
        {
          id: 'generation-refresh',
          prompt: 'a lighthouse',
          model: 'gpt-image-2',
          createdAt: 1_700_000_000_000,
          status: 'completed',
          images: [
            { id: 'image-refresh', src: '/api/draw/images/image-refresh' },
          ],
        },
      ],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
      await flushAsyncWork()
    })

    const historyPanel = container.querySelector(
      '[data-testid="draw-history-panel"]'
    )
    assert.ok(historyPanel)
    const refreshButton = historyPanel.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh"]'
    )
    const clearTrigger = [...historyPanel.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Clear'
    )
    assert.ok(refreshButton)
    assert.ok(clearTrigger)
    const headerButtons = [...historyPanel.querySelectorAll('button')]
    assert.ok(
      headerButtons.indexOf(refreshButton) < headerButtons.indexOf(clearTrigger)
    )

    assert.equal(historyFetchCalls, 0)
    await act(async () => {
      refreshButton.click()
      await flushAsyncWork()
    })
    assert.equal(historyFetchCalls, 1)

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.get = originalApiGet
  })

  test('deletes a single image from a history record', async () => {
    isCompactViewport = false
    const originalApiGet = api.get
    const originalApiDelete = api.delete
    const deletedUrls: string[] = []
    api.get = (async (url: string, config?: ApiRequestConfig) => {
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['fake-image'], { type: 'image/png' }) }
      }
      return originalApiGet(url, config)
    }) as typeof api.get
    api.delete = (async (url: string) => {
      deletedUrls.push(url)
      return { data: { success: true } }
    }) as typeof api.delete

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-history', undefined],
      [
        {
          id: 'generation-two-images',
          prompt: 'two boats',
          model: 'gpt-image-2',
          createdAt: 1_700_000_000_000,
          status: 'completed',
          images: [
            { id: 'image-one', src: '/api/draw/images/image-one' },
            { id: 'image-two', src: '/api/draw/images/image-two' },
          ],
        },
      ],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
      await flushAsyncWork()
    })

    const historyPanel = container.querySelector(
      '[data-testid="draw-history-panel"]'
    )
    assert.ok(historyPanel)
    const deleteButtons = [
      ...historyPanel.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Delete image"]'
      ),
    ]
    assert.equal(deleteButtons.length, 2)

    await act(async () => {
      deleteButtons[1]?.click()
    })
    const confirmDeleteButton = [
      ...document.body.querySelectorAll('button'),
    ].find((button) => button.textContent?.trim() === 'Delete image')
    assert.ok(confirmDeleteButton)
    await act(async () => {
      confirmDeleteButton.click()
      await flushAsyncWork()
    })

    assert.deepEqual(deletedUrls, ['/api/draw/images/image-two'])
    assert.equal(
      historyPanel.querySelectorAll('[aria-label="Delete image"]').length,
      1
    )
    assert.equal(
      container.querySelectorAll('img[alt="Generated image"]').length,
      2
    )

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.get = originalApiGet
    api.delete = originalApiDelete
  })

  test('adds uploaded reference images to the preview and the generation request', async () => {
    isCompactViewport = false
    const originalApiPost = api.post
    const originalApiGet = api.get
    const postedBodies: Array<Record<string, unknown>> = []
    const uploadedFiles = [
      new domWindow.File(['fake-png-a'], 'ref-a.png', { type: 'image/png' }),
      new domWindow.File(['fake-png-b'], 'ref-b.png', { type: 'image/png' }),
    ]
    api.get = (async (url: string) => {
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['img'], { type: 'image/png' }) }
      }
      return originalApiGet(url)
    }) as typeof api.get
    api.post = (async (_url: string, data: unknown) => {
      postedBodies.push(data as Record<string, unknown>)
      return {
        data: {
          data: [{ url: '/api/draw/images/result-1' }],
        },
      }
    }) as typeof api.post

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const fileInput = container.querySelector<HTMLInputElement>(
      '#draw-reference-images'
    )
    assert.ok(fileInput)
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: uploadedFiles,
    })
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })

    assert.ok(container.querySelector('img[alt="ref-a.png"]'))
    assert.ok(container.querySelector('img[alt="ref-b.png"]'))
    assert.equal(
      container.querySelectorAll('[aria-label="Remove reference image"]')
        .length,
      2
    )

    const promptInput = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Describe the image you want to create"]'
    )
    assert.ok(promptInput)
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      valueSetter?.call(promptInput, 'a lighthouse')
      promptInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const generateButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Start generating')
    )
    assert.ok(generateButton)
    await act(async () => {
      generateButton.click()
      await flushAsyncWork()
    })

    assert.equal(postedBodies.length, 1)
    const images = postedBodies[0]?.images
    assert.equal(Array.isArray(images), true)
    assert.equal((images as string[]).length, 2)
    assert.equal(
      (images as string[])[0]?.startsWith('data:image/png;base64,'),
      true
    )
    assert.equal(
      (images as string[])[1]?.startsWith('data:image/png;base64,'),
      true
    )

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.post = originalApiPost
    api.get = originalApiGet
  })

  test('keeps reference thumbnails on one horizontal row so the prompt card never grows', async () => {
    isCompactViewport = false
    const originalApiGet = api.get
    api.get = (async () => ({
      data: { success: true, data: [] },
    })) as typeof api.get

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const fileInput = container.querySelector<HTMLInputElement>(
      '#draw-reference-images'
    )
    assert.ok(fileInput)
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [
        new domWindow.File(['fake-png-a'], 'ref-a.png', { type: 'image/png' }),
        new domWindow.File(['fake-png-b'], 'ref-b.png', { type: 'image/png' }),
        new domWindow.File(['fake-png-c'], 'ref-c.png', { type: 'image/png' }),
        new domWindow.File(['fake-png-d'], 'ref-d.png', { type: 'image/png' }),
      ],
    })
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })

    const thumbnailRow = [...container.querySelectorAll('div')].find(
      (element) => element.classList.contains('overflow-x-auto')
    )
    assert.ok(thumbnailRow)
    assert.equal(thumbnailRow.classList.contains('flex-wrap'), false)
    assert.equal(
      container.querySelectorAll('[data-testid="reference-image-thumb"]')
        .length,
      4
    )
    const thumbnails = container.querySelectorAll(
      '[data-testid="reference-image-thumb"]'
    )
    for (const thumbnail of thumbnails) {
      assert.ok(thumbnail.classList.contains('shrink-0'))
    }

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.get = originalApiGet
  })

  test('reorders reference image thumbnails by dragging', async () => {
    isCompactViewport = false
    const originalApiPost = api.post
    const originalApiGet = api.get
    const uploadedFiles = [
      new domWindow.File(['fake-png-a'], 'ref-a.png', { type: 'image/png' }),
      new domWindow.File(['fake-png-b'], 'ref-b.png', { type: 'image/png' }),
    ]
    api.get = (async (url: string) => {
      if (url.startsWith('/api/draw/images/')) {
        return { data: new Blob(['img'], { type: 'image/png' }) }
      }
      return originalApiGet(url)
    }) as typeof api.get
    api.post = (async () => ({
      data: { data: [{ url: '/api/draw/images/result-1' }] },
    })) as typeof api.post

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(
      ['drawing-tokens', undefined],
      [{ id: 17, name: 'Primary image token' }],
      { updatedAt: Date.now() + 60_000 }
    )
    queryClient.setQueryData(
      ['drawing-models', undefined, 17],
      ['gpt-image-2'],
      { updatedAt: Date.now() + 60_000 }
    )

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <DrawPlaza />
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    const fileInput = container.querySelector<HTMLInputElement>(
      '#draw-reference-images'
    )
    assert.ok(fileInput)
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: uploadedFiles,
    })
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })

    const thumbnailImages = [
      ...container.querySelectorAll(
        '[data-testid="reference-image-uploader"] img'
      ),
    ]
    assert.equal(thumbnailImages.length, 2)
    const firstThumb = thumbnailImages[0]?.parentElement
    const secondThumb = thumbnailImages[1]?.parentElement
    assert.ok(firstThumb)
    assert.ok(secondThumb)
    assert.equal(firstThumb.getAttribute('draggable'), 'true')

    const makeDragEvent = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: { effectAllowed: '', setData: () => {}, getData: () => '' },
      })
      return event
    }

    await act(async () => {
      firstThumb.dispatchEvent(makeDragEvent('dragstart'))
    })
    await act(async () => {
      secondThumb.dispatchEvent(makeDragEvent('dragover'))
    })
    await act(async () => {
      secondThumb.dispatchEvent(makeDragEvent('drop'))
      await flushAsyncWork()
    })

    const reorderedAlts = [
      ...container.querySelectorAll(
        '[data-testid="reference-image-uploader"] img'
      ),
    ].map((img) => img.getAttribute('alt'))
    assert.deepEqual(reorderedAlts, ['ref-b.png', 'ref-a.png'])

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    api.post = originalApiPost
    api.get = originalApiGet
  })
})
