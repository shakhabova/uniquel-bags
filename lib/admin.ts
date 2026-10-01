import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function isAdmin(){const user=await getChatGPTUser();const allowed=env.ADMIN_EMAIL?.trim().toLowerCase();return !!(user&&allowed&&user.email.toLowerCase()===allowed);}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin;}
export async function authorize(request:Request){if(!await isAdmin())return Response.json({error:'Доступ разрешён только администратору'},{status:403});if(!sameOrigin(request))return Response.json({error:'Недопустимый источник запроса'},{status:403});return null;}
