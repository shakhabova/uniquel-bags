import type {Product} from './products';

type Photos = Pick<Product,'image'|'colors'|'colorImages'|'colorPhotos'>;

// Admin galleries do not invent a fallback photo for a newly added color.
export function assignedColorPhotos(product:Photos,color:string):string[]{
 if(!color||!product.colors.includes(color))return [];
 return product.colorPhotos?.[color]?.length?product.colorPhotos[color]:product.colorImages?.[color]?[product.colorImages[color]]:[];
}

export function addColorPhoto<T extends Photos>(product:T,image:string,color:string):T {
 if(!color||!product.colors.includes(color)||!image)return product;
 const photos=assignedColorPhotos(product,color);
 if(photos.includes(image)||photos.length>=10)return product;
 const next=[...photos,image];
 return {...product,image:product.image||image,colorImages:{...product.colorImages,[color]:next[0]},colorPhotos:{...product.colorPhotos,[color]:next}};
}

export function replaceColorPhoto<T extends Photos>(product:T,image:string,color:string,index:number):T {
 const photos=assignedColorPhotos(product,color);
 if(!image||index<0||index>=photos.length||(photos.includes(image)&&photos[index]!==image))return product;
 const previous=photos[index];const next=[...photos];next[index]=image;
 return {...product,image:product.image===previous?image:product.image,colorImages:{...product.colorImages,[color]:next[0]},colorPhotos:{...product.colorPhotos,[color]:next}};
}

export function removeColorPhoto<T extends Photos>(product:T,color:string,index:number):T {
 const photos=assignedColorPhotos(product,color);
 if(index<0||index>=photos.length)return product;
 const removed=photos[index];const next=photos.filter((_,i)=>i!==index);
 const colorImages={...product.colorImages},colorPhotos={...product.colorPhotos};
 if(next.length){colorImages[color]=next[0];colorPhotos[color]=next}else{delete colorImages[color];delete colorPhotos[color]}
 // Prefer another photo from this color, then another explicitly assigned photo.
 const replacement=next[0]||product.colors.filter(c=>c!==color).flatMap(c=>assignedColorPhotos(product,c))[0]||'';
 return {...product,colorImages,colorPhotos,image:product.image===removed?replacement:product.image};
}


export function setProductPhoto<T extends Photos>(product:T,image:string,color=''):T {
 if(color&&!product.colors.includes(color)||!color&&product.colors.length)return product;
 const colorImages={...product.colorImages};
 if(color)colorImages[color]=image;
 // Uploading another color, or replacing its photo, never promotes a new cover.
 return {...product,colorImages,image:color?product.image||image:image};
}

// Editing an existing cover's color photo must update the cover as well, unlike
// uploading a different photo, which deliberately preserves the first cover.
export function editProductPhoto<T extends Photos>(product:T,image:string,color=''):T {
 if(color&&!product.colors.includes(color))return product;
 const previous=color?product.colorImages?.[color]||product.image:product.image;
 const colorImages={...product.colorImages},colorPhotos={...product.colorPhotos};
 if(color)colorImages[color]=image;
 else for(const selected of product.colors){
  if((colorImages[selected]||product.image)===previous)colorImages[selected]=image;
  if(colorPhotos[selected])colorPhotos[selected]=colorPhotos[selected].map(photo=>photo===previous?image:photo);
 }
 return {...product,colorImages,colorPhotos,image:!color||previous===product.image?image:product.image};
}

export function toggleProductColor<T extends Photos>(product:T,color:string):T {
 const selected=product.colors.includes(color);
 const colorImages={...product.colorImages},colorPhotos={...product.colorPhotos};
 if(selected){delete colorImages[color];delete colorPhotos[color]}
 else if(!product.colors.length&&product.image)colorImages[color]=product.image;
 return {...product,colors:selected?product.colors.filter(c=>c!==color):[...product.colors,color],colorImages,colorPhotos};
}
