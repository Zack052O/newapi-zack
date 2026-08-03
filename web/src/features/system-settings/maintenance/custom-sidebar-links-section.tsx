import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  type CustomSidebarLinksConfig,
} from './config'

const linkSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  url: z.string().min(1, 'URL is required'),
  icon: z.string().optional().default(''),
  badge: z.string().optional().default(''),
  requiredRole: z.string().optional().default('0'),
})

const formSchema = z.object({
  links: z.array(linkSchema),
})

type FormValues = z.infer<typeof formSchema>

type CustomSidebarLinksSectionProps = {
  config: CustomSidebarLinksConfig
  initialSerialized: string
}

const ROLE_OPTIONS = [
  { value: '0', label: '所有人' },
  { value: '1', label: '登录用户' },
  { value: '10', label: '仅管理员' },
  { value: '100', label: '仅超级管理员' },
]

const ICON_OPTIONS = [
  '',
  'BookOpen',
  'ExternalLink',
  'Globe',
  'Link',
  'FileText',
  'HelpCircle',
  'Github',
  'MessageSquare',
  'Server',
  'Cloud',
  'Settings',
  'Terminal',
  'Shield',
  'Zap',
  'Rocket',
  'Star',
  'Mail',
  'Bell',
  'LayoutGrid',
  'FolderGit2',
  'Code2',
  'BookMarked',
  'GraduationCap',
  'LifeBuoy',
  'Newspaper',
  'Rss',
]

function toFormValues(config: CustomSidebarLinksConfig): FormValues {
  return {
    links: config.map((link) => ({
      title: link.title,
      url: link.url,
      icon: link.icon ?? '',
      badge: link.badge ?? '',
      requiredRole: String(link.requiredRole ?? 0),
    })),
  }
}

function toConfig(values: FormValues): CustomSidebarLinksConfig {
  return values.links.map((link) => ({
    title: link.title,
    url: link.url,
    icon: link.icon || undefined,
    badge: link.badge || undefined,
    requiredRole: Number(link.requiredRole) || 0,
  }))
}

export function CustomSidebarLinksSection({
  config,
  initialSerialized,
}: CustomSidebarLinksSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const formDefaults = useMemo(() => toFormValues(config), [config])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [formDefaults, form])

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'links',
  })

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const onSubmit = async (values: FormValues) => {
    const config = toConfig(values)
    const serialized = JSON.stringify(config)
    if (serialized === initialSerialized) {
      return
    }
    await updateOption.mutateAsync({
      key: 'CustomSidebarLinks',
      value: serialized,
    })
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    move(draggedIndex, index)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const isExternalUrl = (url: string) => {
    return /^https?:\/\//.test(url)
  }

  return (
    <SettingsSection title={t('自定义侧边栏链接')}>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='space-y-6'
        >
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='保存'
          />

          <FormDescription>
            {t(
              '在侧边栏添加自定义链接。内部路径（如 /pricing）在应用内导航；外部链接（https://...）在新标签页打开。'
            )}
          </FormDescription>

          {fields.length === 0 && (
            <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8 text-center'>
              <p className='text-sm text-muted-foreground'>
                {t('还没有自定义链接，点击"添加链接"开始')}
              </p>
            </div>
          )}

          <div className='space-y-3'>
            {fields.map((field, index) => {
              const urlValue = form.watch(`links.${index}.url`)
              const external = isExternalUrl(urlValue || '')
              return (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className='group relative rounded-lg border border-border bg-card p-4'
                >
                  <div className='mb-3 flex items-center gap-2'>
                    <GripVertical className='size-4 cursor-grab text-muted-foreground/50 active:cursor-grabbing' />
                    <span className='text-xs font-medium text-muted-foreground'>
                      {t('链接')} #{index + 1}
                    </span>
                    {external && (
                      <span className='flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400'>
                        <ExternalLink className='size-2.5' />
                        External
                      </span>
                    )}
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='ml-auto size-7 text-muted-foreground hover:text-destructive'
                      onClick={() => remove(index)}
                    >
                      <Trash2 className='size-3.5' />
                    </Button>
                  </div>

                  <div className='grid gap-3 md:grid-cols-2'>
                    <FormField
                      control={form.control}
                      name={`links.${index}.title`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className='text-xs'>
                            {t('标题')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...f}
                              value={f.value ?? ''}
                              placeholder='例如：文档'
                              className='h-8'
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`links.${index}.url`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className='text-xs'>URL</FormLabel>
                          <FormControl>
                            <Input
                              {...f}
                              value={f.value ?? ''}
                              placeholder='/pricing 或 https://example.com'
                              className='h-8'
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`links.${index}.icon`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className='text-xs'>
                            {t('图标')}
                          </FormLabel>
                          <Select
                            onValueChange={f.onChange}
                            value={f.value ?? ''}
                          >
                            <FormControl>
                              <SelectTrigger className='h-8'>
                                <SelectValue placeholder='无' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='none'>无</SelectItem>
                              {ICON_OPTIONS.filter((i) => i !== '').map(
                                (icon) => (
                                  <SelectItem key={icon} value={icon}>
                                    {icon}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`links.${index}.badge`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className='text-xs'>
                            {t('徽章')} ({t('可选')})
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...f}
                              value={f.value ?? ''}
                              placeholder='新'
                              className='h-8'
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`links.${index}.requiredRole`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className='text-xs'>
                            {t('可见范围')}
                          </FormLabel>
                          <Select
                            onValueChange={f.onChange}
                            value={f.value ?? '0'}
                          >
                            <FormControl>
                              <SelectTrigger className='h-8'>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ROLE_OPTIONS.map((opt) => (
                                <SelectItem
                                  key={opt.value}
                                  value={opt.value}
                                >
                                  {t(opt.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              append({
                title: '',
                url: '',
                icon: '',
                badge: '',
                requiredRole: '0',
              })
            }
          >
            <Plus className='mr-2 size-4' />
            {t('添加链接')}
          </Button>

          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save custom links'
          />
        </form>
      </Form>
    </SettingsSection>
  )
}
