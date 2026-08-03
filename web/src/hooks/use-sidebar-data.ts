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
  Activity,
  BookOpen,
  Box,
  Code2,
  CreditCard,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderGit2,
  Globe,
  GraduationCap,
  HelpCircle,
  Key,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Link as LinkIcon,
  ListTodo,
  Mail,
  MessageSquare,
  Newspaper,
  Radio,
  Rss,
  Server,
  ServerCog,
  Settings,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Ticket,
  User,
  Users,
  Wallet,
  Zap,
  Rocket,
  Bell,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { type SidebarData } from '@/components/layout/types'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'

/**
 * Map of icon names to lucide-react icon components.
 * Used to resolve icon names from backend custom sidebar link config.
 */
const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  Code2,
  ExternalLink,
  FileText,
  FolderGit2,
  Globe,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  LifeBuoy,
  Link: LinkIcon,
  Mail,
  MessageSquare,
  Newspaper,
  Rss,
  Server,
  ServerCog,
  Settings,
  Shield,
  Star,
  Terminal,
  Zap,
  Rocket,
  Bell,
  Activity,
  Box,
  Key,
  LayoutDashboard,
  ListTodo,
  Radio,
  Ticket,
  User,
  Users,
  Wallet,
  CreditCard,
}

function resolveIcon(iconName?: string): React.ElementType | undefined {
  if (!iconName || iconName === 'none') return undefined
  return ICON_MAP[iconName]
}

type ParsedCustomLink = {
  title: string
  url: string
  icon?: string
  badge?: string
  requiredRole?: number
}

/**
 * Parse and filter custom sidebar links from the status API response.
 * Returns links visible to the current user's role.
 */
function useCustomSidebarLinks(): ParsedCustomLink[] {
  const { status } = useStatus()
  const userRole = useAuthStore((s) => s.auth.user?.role)
  const role = userRole ?? ROLE.GUEST

  const raw = status?.CustomSidebarLinks as string | null | undefined
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return []
  }

  let parsed: ParsedCustomLink[]
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    parsed = data
  } catch {
    return []
  }

  return parsed.filter((link) => {
    if (typeof link !== 'object' || link === null) return false
    if (typeof link.title !== 'string' || typeof link.url !== 'string')
      return false
    if (link.requiredRole !== undefined && role < link.requiredRole) {
      return false
    }
    return true
  })
}

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 *
 * Custom sidebar links from the backend `CustomSidebarLinks` option are
 * appended as a dedicated "Links" group at the end.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const customLinks = useCustomSidebarLinks()

  const navGroups = [
    {
      id: 'chat',
      title: t('Chat'),
      items: [
        {
          title: t('Playground'),
          url: '/playground',
          icon: FlaskConical,
        },
        {
          title: t('画图广场'),
          url: '/draw',
          icon: Sparkles,
        },
        {
          title: t('Chat'),
          icon: MessageSquare,
          type: 'chat-presets' as const,
        },
      ],
    },
    {
      id: 'general',
      title: t('General'),
      items: [
        {
          title: t('Overview'),
          url: '/dashboard/overview',
          icon: Activity,
        },
        {
          title: t('Dashboard'),
          url: '/dashboard/models',
          icon: LayoutDashboard,
        },
        {
          title: t('API Keys'),
          url: '/keys',
          icon: Key,
        },
        {
          title: t('Usage Logs'),
          url: '/usage-logs/common',
          icon: FileText,
        },
        {
          title: t('Task Logs'),
          url: '/usage-logs/task',
          activeUrls: ['/usage-logs/drawing'],
          configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
          icon: ListTodo,
        },
      ],
    },
    {
      id: 'personal',
      title: t('Personal'),
      items: [
        {
          title: t('Wallet'),
          url: '/wallet',
          icon: Wallet,
        },
        {
          title: t('Profile'),
          url: '/profile',
          icon: User,
        },
      ],
    },
    {
      id: 'admin',
      title: t('Admin'),
      items: [
        {
          title: t('Channels'),
          url: '/channels',
          icon: Radio,
        },
        {
          title: t('Models'),
          url: '/models/metadata',
          icon: Box,
        },
        {
          title: t('Users'),
          url: '/users',
          icon: Users,
        },
        {
          title: t('Redemption Codes'),
          url: '/redemption-codes',
          icon: Ticket,
        },
        {
          title: t('Subscriptions'),
          url: '/subscriptions',
          icon: CreditCard,
        },
        {
          title: t('System Info'),
          url: '/system-info',
          icon: ServerCog,
          requiredRole: ROLE.SUPER_ADMIN,
        },
        {
          title: t('System Settings'),
          url: '/system-settings/site',
          activeUrls: ['/system-settings'],
          icon: Settings,
        },
      ],
    },
  ]

  if (customLinks.length > 0) {
    navGroups.push({
      id: 'custom-links',
      title: t('Links'),
      items: customLinks.map((link) => ({
        title: link.title,
        url: link.url,
        icon: resolveIcon(link.icon),
        badge: link.badge,
      })),
    })
  }

  return { navGroups }
}
