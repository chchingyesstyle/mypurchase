import type { ReactNode } from 'react';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  emptyMessage,
  getRowKey,
  rows = []
}: {
  columns: DataTableColumn<T>[];
  emptyMessage: ReactNode;
  getRowKey: (row: T) => string;
  rows?: T[];
}) {
  if (rows.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.className} key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td className={column.className} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
