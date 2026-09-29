'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountGate } from '@/components/account-gate';
import { Workbench } from '@/features/workbench';
export default function Home(){const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:1}}}));return <QueryClientProvider client={queryClient}><AccountGate>{(user,logout,updateUser)=><Workbench key={user.id} user={user} logout={logout} updateUser={updateUser}/>}</AccountGate></QueryClientProvider>}
