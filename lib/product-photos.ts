import type {Product} from './products';

type Photos = Pick<Product,'image'|'colors'|'colorImages'>;

export function setProductPhoto<T extends Photos>(product:T,image:string,color=''):T {
 const colorImages={...product.colorImages};
 if(color&&!product.colors.includes(color))return product;
 const updateMain=!color||!product.image||colorImages[color]===product.image;
 // Preserve photos currently inherited from the main image before replacing it.
 if(updateMain&&product.image){
  for(const selected of product.colors)if(!colorImages[selected])colorImages[selected]=product.image;
 }
 if(color)colorImages[color]=image;
 else if(!product.image&&product.colors.length&&!colorImages[product.colors[0]])colorImages[product.colors[0]]=image;
 return {...product,colorImages,image:updateMain&&(!color||image)?image:product.image};
}

export function toggleProductColor<T extends Photos>(product:T,color:string):T {
 const selected=product.colors.includes(color);
 const colorImages={...product.colorImages};
 if(selected)delete colorImages[color];
 else if(!product.colors.length&&product.image)colorImages[color]=product.image;
 return {...product,colors:selected?product.colors.filter(c=>c!==color):[...product.colors,color],colorImages};
}
