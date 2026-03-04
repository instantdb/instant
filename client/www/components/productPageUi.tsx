import { products, productIcons } from '@/lib/productData';
import { Link } from '@/components/marketingUi';
import { cn } from '@/components/ui';

export function ProductNav({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="hidden border-b border-gray-200 py-3 min-[60rem]:block">
      <div className="mx-auto max-w-7xl px-8">
        <div className="flex justify-center">
          <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
            {products.map((product) => {
              const Icon = productIcons[product.id];
              return (
                <Link
                  key={product.id}
                  href={`/product/${product.id}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all',
                    product.id === currentSlug
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {product.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
