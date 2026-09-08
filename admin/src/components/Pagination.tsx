import "./Pagination.css";

export interface PaginationLabels {
  /** 总数文案，如 `(n) => \`共 ${n} 条\`` */
  total?: (total: number) => string;
  /** 每页条数选择前缀 */
  pageSize?: string;
  /** 页码位置文案，如 `(page, totalPages) => \`第 ${page} / ${totalPages} 页\`` */
  position?: (page: number, totalPages: number) => string;
  prev?: string;
  next?: string;
}

export interface PaginationProps {
  /** 当前页，从 1 开始 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总条数 */
  total: number;
  /** 可选的每页条数，默认 [30, 50, 100] */
  pageSizeOptions?: number[];
  /** 文案覆盖，默认中文 */
  labels?: PaginationLabels;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i += 1) result.push(i);
  return result;
}

function buildPageItems(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) return range(1, totalPages);
  const items: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) items.push("...");
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < totalPages - 1) items.push("...");
  items.push(totalPages);
  return items;
}

export default function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [30, 50, 100],
  labels,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const totalText = labels?.total ?? ((n: number) => `共 ${n} 条`);
  const pageSizeLabel = labels?.pageSize ?? "每页";
  const positionText =
    labels?.position ?? ((p: number, tp: number) => `第 ${p} / ${tp} 页`);
  const prevLabel = labels?.prev ?? "上一页";
  const nextLabel = labels?.next ?? "下一页";

  return (
    <nav className="pagination" aria-label="分页">
      <span className="pagination-total">{totalText(total)}</span>

      <label className="pagination-size">
        <span>{pageSizeLabel}</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="pagination-pages">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
          aria-label={prevLabel}
          title={prevLabel}
        >
          ‹
        </button>

        {buildPageItems(current, totalPages).map((item, index) =>
          item === "..." ? (
            <span className="pagination-ellipsis" key={`ellipsis-${index}`}>
              …
            </span>
          ) : (
            <button
              type="button"
              className={
                item === current
                  ? "pagination-btn active"
                  : "pagination-btn"
              }
              onClick={() => onPageChange(item)}
              aria-current={item === current ? "page" : undefined}
              key={item}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(current + 1)}
          disabled={current >= totalPages}
          aria-label={nextLabel}
          title={nextLabel}
        >
          ›
        </button>
      </div>

      <span className="pagination-position">{positionText(current, totalPages)}</span>
    </nav>
  );
}
