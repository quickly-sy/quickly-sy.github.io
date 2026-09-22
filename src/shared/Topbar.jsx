import logo from './assets/quickly-logo.webp';

export default function Topbar({ subtitle, tabs = [], active, onTab, right, onLogout }) {
  return (
    <header className="topbar">
      <span className="brand">
        <img src={logo} alt="Quickly" />
        {subtitle && <small>{subtitle}</small>}
      </span>
      {tabs.length > 0 && (
        <nav className="tabs">
          {tabs.map(([key, label]) => (
            <button key={key} className={active === key ? 'on' : ''} onClick={() => onTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="spacer" />
      {right}
      <button className="ghost sm" onClick={onLogout}>خروج</button>
    </header>
  );
}
