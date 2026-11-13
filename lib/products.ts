export const categories=['Сумки','Шопперы','Кросс-боди','Рюкзаки','Клатчи','Аксессуары'];
export const materials=['Экокожа','Натуральная кожа','Текстиль','Замша'];
export const colors=[{name:'Чёрный',hex:'#20201d'},{name:'Коричневый',hex:'#8b5636'},{name:'Бежевый',hex:'#d6c5a5'},{name:'Бордовый',hex:'#702a31'},{name:'Зелёный',hex:'#59603a'},{name:'Белый',hex:'#eee8dc'},{name:'Серый',hex:'#8b8e90'},{name:'Голубой',hex:'#8bbde0'}];
export type Product={id:string;name:string;category:string;material:string;colors:string[];colorImages?:Record<string,string>;colorPhotos?:Record<string,string[]>;price:number;oldPrice:number|null;description:string;size:string;image:string;stock:'В наличии'|'Под заказ';badge:string;demo:boolean;archived:boolean;createdAt:string;};
export function productImage(product:Pick<Product,'colors'|'colorImages'|'image'>,color=''){return product.colors.includes(color)&&product.colorImages?.[color]||product.image;}
export const MAX_COLOR_PHOTOS=10;
export function productGallery(product:Pick<Product,'colors'|'colorImages'|'colorPhotos'|'image'>,color=''):string[]{
 if(color&&product.colors.includes(color)&&product.colorPhotos?.[color]?.length)return product.colorPhotos[color];
 const image=productImage(product,color);
 return image?[image]:[];
}
export function primaryColor(product:Pick<Product,'colors'|'colorImages'|'colorPhotos'|'image'>){return product.colors.find(color=>product.colorImages?.[color]===product.image||product.colorPhotos?.[color]?.includes(product.image))??product.colors[0]??'';}
function validateImage(image:string){
 if(!image||image.length>2000)throw new Error('Укажите ссылку на фото или загрузите файл');
 if(image.startsWith('/api/images/')&&/^[a-f0-9-]+[.](jpg|png|webp)$/.test(image.slice(12)))return;
 let url:URL;try{url=new URL(image)}catch{throw new Error('Укажите ссылку на фото или загрузите файл')}
 if(url.protocol!=='https:')throw new Error('Ссылка на фото должна начинаться с https://');
}
export const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
const pictures=['photo-1584917865442-de89df76afd3','photo-1548036328-c9fa89d128fa','photo-1553062407-98eeb64c6a62'];
export const samples:Product[]=[['Classic Wine','Сумки',6490,'Бордовый','Хит'],['Minimal Black','Шопперы',5290,'Чёрный','Новинка'],['Daisy Beige','Сумки',6990,'Бежевый',''],['Mono','Кросс-боди',4990,'Коричневый','−15%'],['City Brown','Рюкзаки',7990,'Коричневый',''],['Soft Forest','Клатчи',3490,'Зелёный','Limited'],['Luna Black','Сумки',6290,'Чёрный',''],['Mio Cream','Сумки',5790,'Белый','Новинка'],['Day Bordo','Шопперы',4990,'Бордовый','']].map((a,i)=>({id:'demo-'+i,name:String(a[0]),category:String(a[1]),price:Number(a[2]),colors:[String(a[3])],badge:String(a[4]),material:'Экокожа',oldPrice:i===3?5890:null,size:'',description:'Демонстрационная модель для знакомства с каталогом. Фотография иллюстративная. Добавьте реальные фотографии и характеристики через панель администратора.',image:'https://images.unsplash.com/'+pictures[i===4?2:i%2]+'?w=800&q=85',stock:'В наличии',demo:true,archived:false,createdAt:'2026-10-01T00:00:00Z'}));
export function validateProduct(value:unknown):Omit<Product,'id'|'createdAt'|'archived'>{
 if(!value||typeof value!=='object')throw new Error('Заполните данные товара'); const v=value as Record<string,unknown>;
 const str=(key:string,max:number,required=false)=>{const s=typeof v[key]==='string'?String(v[key]).trim():'';if(s.length>max||(required&&!s))throw new Error('Проверьте поле «'+key+'»');return s;};
 const price=v.price,oldPrice=v.oldPrice===null||v.oldPrice===''?null:v.oldPrice;
 if(typeof price!=='number'||!Number.isFinite(price)||price<=0||price>10000000||Math.abs(Math.round(price*100)-price*100)>0.000001)throw new Error('Цена должна быть положительным числом, не более двух знаков после запятой');
 if(oldPrice!==null&&(typeof oldPrice!=='number'||!Number.isFinite(oldPrice)||oldPrice<=price||oldPrice>10000000))throw new Error('Старая цена должна быть выше текущей');
 const category=str('category',50,true),material=str('material',50,true),stock=str('stock',30,true),image=str('image',2000,true);
 if(!categories.includes(category)||!materials.includes(material)||!['В наличии','Под заказ'].includes(stock))throw new Error('Выберите категорию, материал и наличие из списка');
 if(!Array.isArray(v.colors)||v.colors.some(c=>!colors.some(x=>x.name===c)))throw new Error('Выберите цвета из списка');
 validateImage(image);
 const colorImages:Record<string,string>={};
 if(v.colorImages!==undefined){
  if(!v.colorImages||typeof v.colorImages!=='object'||Array.isArray(v.colorImages))throw new Error('Проверьте фотографии цветов');
  for(const [color,photo] of Object.entries(v.colorImages)){
   if(!(v.colors as string[]).includes(color)||typeof photo!=='string')throw new Error('Фотографии можно добавить только для выбранных цветов');
   const trimmed=photo.trim();if(!trimmed)continue;validateImage(trimmed);colorImages[color]=trimmed;
  }
 }
 const colorPhotos:Record<string,string[]>={};
 if(v.colorPhotos!==undefined){
  if(!v.colorPhotos||typeof v.colorPhotos!=='object'||Array.isArray(v.colorPhotos))throw new Error('Проверьте фотографии цветов');
  for(const [color,photos] of Object.entries(v.colorPhotos)){
   if(!(v.colors as string[]).includes(color)||!Array.isArray(photos)||photos.length>MAX_COLOR_PHOTOS)throw new Error('Для каждого цвета можно добавить до 10 фотографий');
   const clean:string[]=[];
   for(const photo of photos){if(typeof photo!=='string')throw new Error('Проверьте фотографии цветов');const trimmed=photo.trim();validateImage(trimmed);if(clean.includes(trimmed))throw new Error('Одинаковые фотографии нельзя добавить дважды');clean.push(trimmed)}
   if(clean.length){colorPhotos[color]=clean;colorImages[color]=clean[0]}
  }
 }
 return {name:str('name',100,true),category,material,stock:stock as Product['stock'],image,colorImages,colorPhotos,colors:[...new Set(v.colors as string[])],price,oldPrice:oldPrice as number|null,description:str('description',5000),size:str('size',100),badge:str('badge',30),demo:v.demo===true};
}
