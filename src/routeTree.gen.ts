/* eslint-disable */

// @ts-nocheck

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AuthenticatedRouteRouteImport } from './routes/_authenticated/route'
import { Route as AuthRouteImport } from './routes/auth'
import { Route as AuthenticatedAuditRouteImport } from './routes/_authenticated/audit'
import { Route as AuthenticatedDashboardRouteImport } from './routes/_authenticated/dashboard'
import { Route as AuthenticatedImportRouteImport } from './routes/_authenticated/import'
import { Route as AuthenticatedREntityRouteImport } from './routes/_authenticated/r.$entity'
import { Route as AuthenticatedAIReviewRouteImport } from './routes/_authenticated/ai-review'
import { Route as AuthenticatedAdminUsersRouteImport } from './routes/_authenticated/admin/users'
import { Route as AuthenticatedUserGuideRouteImport } from './routes/_authenticated/user-guide'
import { Route as AuthenticatedReportingRouteImport } from './routes/_authenticated/reporting'
import { Route as AuthenticatedAIChatRouteImport } from './routes/_authenticated/ai-chat'

const IndexRoute=IndexRouteImport.update({id:'/',path:'/',getParentRoute:()=>rootRouteImport} as any)
const AuthenticatedRouteRoute=AuthenticatedRouteRouteImport.update({id:'/_authenticated',getParentRoute:()=>rootRouteImport} as any)
const AuthRoute=AuthRouteImport.update({id:'/auth',path:'/auth',getParentRoute:()=>rootRouteImport} as any)
const AuthenticatedAuditRoute=AuthenticatedAuditRouteImport.update({id:'/audit',path:'/audit',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedDashboardRoute=AuthenticatedDashboardRouteImport.update({id:'/dashboard',path:'/dashboard',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedImportRoute=AuthenticatedImportRouteImport.update({id:'/import',path:'/import',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedREntityRoute=AuthenticatedREntityRouteImport.update({id:'/r/$entity',path:'/r/$entity',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedAIReviewRoute=AuthenticatedAIReviewRouteImport.update({id:'/ai-review',path:'/ai-review',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedUserGuideRoute=AuthenticatedUserGuideRouteImport.update({id:'/user-guide',path:'/user-guide',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedAdminUsersRoute=AuthenticatedAdminUsersRouteImport.update({id:'/admin/users',path:'/admin/users',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedReportingRoute=AuthenticatedReportingRouteImport.update({id:'/reporting',path:'/reporting',getParentRoute:()=>AuthenticatedRouteRoute} as any)
const AuthenticatedAIChatRoute=AuthenticatedAIChatRouteImport.update({id:'/ai-chat',path:'/ai-chat',getParentRoute:()=>AuthenticatedRouteRoute} as any)

export interface FileRoutesByFullPath {
  '/':typeof IndexRoute
  '/auth':typeof AuthRoute
  '/audit':typeof AuthenticatedAuditRoute
  '/dashboard':typeof AuthenticatedDashboardRoute
  '/import':typeof AuthenticatedImportRoute
  '/r/$entity':typeof AuthenticatedREntityRoute
  '/ai-review':typeof AuthenticatedAIReviewRoute
  '/admin/users':typeof AuthenticatedAdminUsersRoute
  '/user-guide':typeof AuthenticatedUserGuideRoute
  '/reporting':typeof AuthenticatedReportingRoute
  '/ai-chat':typeof AuthenticatedAIChatRoute
}
export interface FileRoutesByTo extends FileRoutesByFullPath {}
export interface FileRoutesById extends FileRoutesByFullPath {
  '/_authenticated':typeof AuthenticatedRouteRouteWithChildren
}
export interface FileRouteTypes {
  fileRoutesByFullPath:FileRoutesByFullPath
  fullPaths:'/'|'/auth'|'/audit'|'/dashboard'|'/import'|'/r/$entity'|'/ai-review'|'/admin/users'|'/user-guide'|'/reporting'|'/ai-chat'
  fileRoutesByTo:FileRoutesByTo
  to:FileRouteTypes['fullPaths']
  id:'__root__'|'/'|'/_authenticated'|'/auth'|'/audit'|'/dashboard'|'/import'|'/r/$entity'|'/ai-review'|'/admin/users'|'/user-guide'|'/reporting'|'/ai-chat'
  fileRoutesById:FileRoutesById
}
declare module '@tanstack/react-router' { interface FileRoutesByPath {
  '/reporting':{id:'/reporting';path:'/reporting';fullPath:'/reporting';preLoaderRoute:typeof AuthenticatedReportingRouteImport;parentRoute:typeof AuthenticatedRouteRoute}
  '/ai-chat':{id:'/ai-chat';path:'/ai-chat';fullPath:'/ai-chat';preLoaderRoute:typeof AuthenticatedAIChatRouteImport;parentRoute:typeof AuthenticatedRouteRoute}
}}
interface AuthenticatedRouteRouteChildren {
  AuthenticatedAuditRoute:typeof AuthenticatedAuditRoute
  AuthenticatedDashboardRoute:typeof AuthenticatedDashboardRoute
  AuthenticatedImportRoute:typeof AuthenticatedImportRoute
  AuthenticatedREntityRoute:typeof AuthenticatedREntityRoute
  AuthenticatedAIReviewRoute:typeof AuthenticatedAIReviewRoute
  AuthenticatedAdminUsersRoute:typeof AuthenticatedAdminUsersRoute
  AuthenticatedUserGuideRoute:typeof AuthenticatedUserGuideRoute
  AuthenticatedReportingRoute:typeof AuthenticatedReportingRoute
  AuthenticatedAIChatRoute:typeof AuthenticatedAIChatRoute
}
const AuthenticatedRouteRouteChildren:AuthenticatedRouteRouteChildren={
  AuthenticatedAuditRoute,AuthenticatedDashboardRoute,AuthenticatedImportRoute,AuthenticatedREntityRoute,AuthenticatedAIReviewRoute,AuthenticatedAdminUsersRoute,AuthenticatedUserGuideRoute,AuthenticatedReportingRoute,AuthenticatedAIChatRoute
}
const AuthenticatedRouteRouteWithChildren=AuthenticatedRouteRoute._addFileChildren(AuthenticatedRouteRouteChildren)
const rootRouteChildren={IndexRoute,AuthenticatedRouteRoute:AuthenticatedRouteRouteWithChildren,AuthRoute}
export const routeTree=rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()
import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' { interface Register { ssr:true;router:Awaited<ReturnType<typeof getRouter>>;config:Awaited<ReturnType<typeof startInstance.getOptions>> } }
