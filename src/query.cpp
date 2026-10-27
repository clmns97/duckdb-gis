#include "query.hpp"

#include "nanoarrow/nanoarrow.h"
#include "nanoarrow/nanoarrow_ipc.h"

#include <cstring>

DUCKDB_EXTENSION_EXTERN

namespace gis {

namespace {

// Owns the nanoarrow objects used to encode one result, releasing them in
// reverse order of creation however encoding ends.
class IpcEncoder {
public:
  IpcEncoder() {
    ArrowBufferInit(&buffer);
    ArrowIpcOutputStreamInitBuffer(&stream, &buffer);
    ArrowIpcWriterInit(&writer, &stream); // takes ownership of `stream`
    std::memset(&schema, 0, sizeof(schema));
    std::memset(&view, 0, sizeof(view));
  }

  ~IpcEncoder() {
    if (view_initialized) {
      ArrowArrayViewReset(&view);
    }
    if (schema.release) {
      schema.release(&schema);
    }
    ArrowIpcWriterReset(&writer);
    ArrowBufferReset(&buffer);
  }

  // Takes ownership of `schema` and writes it.
  bool WriteSchema(std::string &error) {
    if (ArrowIpcWriterWriteSchema(&writer, &schema, &na_error) != NANOARROW_OK ||
        ArrowArrayViewInitFromSchema(&view, &schema, &na_error) != NANOARROW_OK) {
      error = na_error.message;
      return false;
    }
    view_initialized = true;
    return true;
  }

  bool WriteBatch(ArrowArray &array, std::string &error) {
    if (ArrowArrayViewSetArray(&view, &array, &na_error) != NANOARROW_OK ||
        ArrowIpcWriterWriteArrayView(&writer, &view, &na_error) != NANOARROW_OK) {
      error = na_error.message;
      return false;
    }
    return true;
  }

  bool Finish(std::string &out, std::string &error) {
    // A null array view writes the end-of-stream marker.
    if (ArrowIpcWriterWriteArrayView(&writer, nullptr, &na_error) != NANOARROW_OK) {
      error = na_error.message;
      return false;
    }
    out.assign(reinterpret_cast<const char *>(buffer.data), buffer.size_bytes);
    return true;
  }

  ArrowSchema schema;

private:
  ArrowBuffer buffer;
  ArrowIpcOutputStream stream;
  ArrowIpcWriter writer;
  ArrowArrayView view;
  bool view_initialized = false;
  ArrowError na_error;
};

// Executes a statement whose result isn't needed.
std::string RunDiscardingResult(duckdb_prepared_statement prepared) {
  duckdb_result result;
  std::string error;
  if (duckdb_execute_prepared(prepared, &result) == DuckDBError) {
    error = duckdb_result_error(&result);
  }
  duckdb_destroy_result(&result);
  return error;
}

// Executes a statement and encodes its result as Arrow IPC. Uses the Arrow
// functions of the v1.2.0 C API band: deprecated in favour of the v1.5.6 ones,
// but part of the stable function table, so present on every DuckDB we target.
std::string RunToIpc(duckdb_prepared_statement prepared, std::string &out) {
  duckdb_arrow arrow = nullptr;
  std::string error;
  if (duckdb_execute_prepared_arrow(prepared, &arrow) == DuckDBError) {
    error = duckdb_query_arrow_error(arrow);
    duckdb_destroy_arrow(&arrow);
    return error;
  }

  IpcEncoder encoder;
  auto schema_out = reinterpret_cast<duckdb_arrow_schema>(&encoder.schema);
  if (duckdb_query_arrow_schema(arrow, &schema_out) == DuckDBError) {
    error = duckdb_query_arrow_error(arrow);
  } else if (encoder.WriteSchema(error)) {
    while (true) {
      ArrowArray array;
      std::memset(&array, 0, sizeof(array));
      auto array_out = reinterpret_cast<duckdb_arrow_array>(&array);
      if (duckdb_query_arrow_array(arrow, &array_out) == DuckDBError) {
        error = duckdb_query_arrow_error(arrow);
        break;
      }
      // An empty or unset array marks the end of the result.
      bool done = !array.release || array.length == 0;
      bool ok = done || encoder.WriteBatch(array, error);
      if (array.release) {
        array.release(&array);
      }
      if (done || !ok) {
        break;
      }
    }
    if (error.empty()) {
      encoder.Finish(out, error);
    }
  }
  duckdb_destroy_arrow(&arrow);
  return error;
}

} // namespace

std::string RunToArrowIpc(duckdb_connection connection, const std::string &sql,
                          std::string &out) {
  duckdb_extracted_statements statements = nullptr;
  idx_t count = duckdb_extract_statements(connection, sql.c_str(), &statements);
  if (count == 0) {
    const char *message = duckdb_extract_statements_error(statements);
    std::string error = message ? message : "No statements";
    duckdb_destroy_extracted(&statements);
    return error;
  }

  std::string error;
  for (idx_t i = 0; i < count && error.empty(); i++) {
    duckdb_prepared_statement prepared = nullptr;
    if (duckdb_prepare_extracted_statement(connection, statements, i, &prepared) ==
        DuckDBError) {
      error = duckdb_prepare_error(prepared);
    } else if (i + 1 < count) {
      error = RunDiscardingResult(prepared);
    } else {
      error = RunToIpc(prepared, out);
    }
    duckdb_destroy_prepare(&prepared);
  }
  duckdb_destroy_extracted(&statements);
  return error;
}

} // namespace gis
