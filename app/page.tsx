import Catalog from '@/components/catalog';import {listProducts} from '@/lib/store';
export const dynamic='force-dynamic';
export default async function Home(){try{return <Catalog initialProducts={await listProducts()}/>;}catch{return <Catalog initialProducts={[]} initialError="Не удалось загрузить каталог. Попробуйте обновить страницу."/>;}}
