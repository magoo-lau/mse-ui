import request from './request'

export interface SysMessage {
  id: number
  type: string
  title: string | null
  content: string
  bizId: string | null
  readFlag: number
  createTime: string
}

export const pageMessages = (params: { pageNum: number; pageSize: number; type?: string; unreadOnly?: boolean }) =>
  request.get('/system/message/page', { params })
export const unreadCount = () => request.get('/system/message/unread-count')
export const markRead = (id: number) => request.post(`/system/message/${id}/read`)
export const markAllRead = () => request.post('/system/message/read-all')
