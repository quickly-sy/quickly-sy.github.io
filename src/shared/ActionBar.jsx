// شريط إجراء ثابت أسفل الشاشة — يبقى ظاهراً مهما نزل المستخدم أو طلع
export default function ActionBar({ children }) {
  return (
    <>
      <div className="action-spacer" aria-hidden="true" />
      <div className="action-bar">
        <div className="action-bar-inner">{children}</div>
      </div>
    </>
  );
}
