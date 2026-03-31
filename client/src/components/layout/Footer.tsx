export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-navy-500 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-slate-500">
          <p>&copy; {new Date().getFullYear()} StockTaxCalculator. Not financial advice.</p>
          <p>Built for investors who hate spreadsheets.</p>
        </div>
      </div>
    </footer>
  );
}
