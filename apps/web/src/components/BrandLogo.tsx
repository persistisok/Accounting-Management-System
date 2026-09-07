import logoUrl from '../../../../img/logo.jpg';

export function BrandLogo() {
  return <span className="brand-logo" aria-hidden="true"><img src={logoUrl} alt="" /></span>;
}
