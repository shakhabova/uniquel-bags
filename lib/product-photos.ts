import type {Product} from './products';

type Photos = Pick<Product,'image'|'colors'|'colorImages'>;

export function setProductPhoto<T extends Photos>(product:T,image:string,color=''):T {
 if(color&&!product.colors.includes(color)||!color&&product.colors.length)return product;
 const colorImages={...product.colorImages};
 if(color)colorImages[color]=image;
 // Uploading another color, or replacing its photo, never promotes a new cover.
 return {...product,colorImages,image:color?product.image||image:image};
}

export function toggleProductColor<T extends Photos>(product:T,color:string):T {
 const selected=product.colors.includes(color);
 const colorImages={...product.colorImages};
 if(selected)delete colorImages[color];
 else if(!product.colors.length&&product.image)colorImages[color]=product.image;
 return {...product,colors:selected?product.colors.filter(c=>c!==color):[...product.colors,color],colorImages};
}
