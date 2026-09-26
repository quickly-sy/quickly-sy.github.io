// اختيار الموديل: نفس الاسم ونفس السعر، أشكال مختلفة.
// ما في إضافة للسلة قبل ما يختار الزبون موديلاً بالتحديد.
import { useState } from 'react';
import { money } from '../shared/utils';

export function variantLabel(product, index) {
  const l = product.variant_labels && product.variant_labels[index];
  return (l && String(l).trim()) || `موديل ${index + 1}`;
}

export function isVariantOff(product, index) {
  const off = product.variant_off;
  return Array.isArray(off) && off.some((x) => Number(x) === Number(index));
}

export function hasVariants(product) {
  return !!product.variant_mode && Array.isArray(product.images) && product.images.length > 1;
}

export default function VariantPicker({ product, onPick, onClose }) {
  const [at, setAt] = useState(() => product.images.findIndex((_, i) => !isVariantOff(product, i)));
  const images = product.images || [];
  const none = at < 0;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="panel stack modal vpick" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h3>{product.name} — اختر الموديل</h3>
          <button className="link" onClick={onClose}>إغلاق</button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          كل الموديلات بنفس السعر {money(product.price)}. الموديل يلي بتختاره بيوصل للمتجر مع طلبك.
        </p>

        <div className="vgrid">
          {images.map((src, i) => {
            const off = isVariantOff(product, i);
            return (
              <button
                key={src + i}
                type="button"
                className={`vcell ${at === i ? 'on' : ''} ${off ? 'off' : ''}`}
                onClick={() => !off && setAt(i)}
                disabled={off}
                aria-pressed={at === i}
              >
                <img src={src} alt="" loading="lazy" />
                <span>{variantLabel(product, i)}</span>
                {off && <em>غير متوفر</em>}
              </button>
            );
          })}
        </div>

        <div className="vpick-foot">
          {none ? (
            <div className="error">كل الموديلات غير متوفرة حالياً.</div>
          ) : (
            <button onClick={() => { onPick(at); onClose(); }}>
              أضف «{variantLabel(product, at)}» للسلة
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
