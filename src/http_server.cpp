#include "http_server.hpp"

#include <duckdb/common/serializer/memory_stream.hpp>
#include <duckdb/common/serializer/binary_serializer.hpp>
#include <duckdb/parser/parser.hpp>
#include "utils/env.hpp"
#include "utils/serialization.hpp"
#include "utils/encoding.hpp"

// Chosen to be no more than half of the lesser of the two limits:
//  - The default httplib thread pool size = 8
//  - The browser limit on the number of server-sent event connections = 6
#define MAX_EVENT_WAIT_COUNT 3

namespace duckdb {
namespace ui {

// An empty Server-Sent Events message. See
// https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes
constexpr const char *EMPTY_SSE_MESSAGE = ":\r\r";
constexpr idx_t EMPTY_SSE_MESSAGE_LENGTH = 3;

bool EventDispatcher::WaitEvent(httplib::DataSink *sink) {
	std::unique_lock<std::mutex> lock(mutex_);
	// Don't allow too many simultaneous waits, because each consumes a thread in the httplib thread pool, and also
	// browsers limit the number of server-sent event connections.
	if (closed_ || wait_count_ >= MAX_EVENT_WAIT_COUNT) {
		return false;
	}
	int target_id = next_id_;
	wait_count_++;
	cv_.wait_for(lock, std::chrono::seconds(5));
	wait_count_--;
	if (closed_) {
		return false;
	}
	if (current_id_ == target_id) {
		sink->write(message_.data(), message_.size());
	} else {
		// Our wait timer expired. Write an empty, no-op message.
		// This enables detecting when the client is gone.
		sink->write(EMPTY_SSE_MESSAGE, EMPTY_SSE_MESSAGE_LENGTH);
	}
	return true;
}

void EventDispatcher::SendEvent(const std::string &message) {
	std::lock_guard<std::mutex> guard(mutex_);
	if (closed_) {
		return;
	}

	current_id_ = next_id_++;
	message_ = message;
	cv_.notify_all();
}

void EventDispatcher::Close() {
	std::lock_guard<std::mutex> guard(mutex_);
	if (closed_) {
		return;
	}
	current_id_ = next_id_++;
	closed_ = true;
	cv_.notify_all();
}

unique_ptr<HttpServer> HttpServer::instance_;

HttpServer* HttpServer::instance() {
	if (!instance_) {
		instance_ = make_uniq<HttpServer>();
		std::atexit(HttpServer::StopInstance);
	}
	return instance_.get();
}

bool HttpServer::Started() {
	return instance_ && instance_->thread_;
}

void HttpServer::StopInstance() {
	if (instance_) {
		instance_->Stop();
	}
}

bool HttpServer::Start(const uint16_t local_port, const std::string &remote_url,
                        const shared_ptr<DatabaseInstance> &ddb_instance) {
	if (thread_) {
		return false;
	}

	local_port_ = local_port;
	remote_url_ = remote_url;
	ddb_instance_ = ddb_instance;
#ifndef UI_EXTENSION_GIT_SHA
#error "UI_EXTENSION_GIT_SHA must be defined"
#endif
	user_agent_ = StringUtil::Format("duckdb-ui/%s(%s)", UI_EXTENSION_GIT_SHA, DuckDB::Platform());
	event_dispatcher_ = make_uniq<EventDispatcher>();
	thread_ = make_uniq<std::thread>(&HttpServer::Run, this);
	return true;
}

bool HttpServer::Stop() {
	if (!thread_) {
		return false;
	}

	event_dispatcher_->Close();
	server_.stop();
	thread_->join();
	thread_.reset();
	event_dispatcher_.reset();
	connections_.clear();
	ddb_instance_.reset();
	remote_url_ = "";
	local_port_ = 0;
	return true;
}

uint16_t HttpServer::LocalPort() {
	return local_port_;
}

void HttpServer::SendConnectedEvent(const std::string &token) {
	SendEvent(StringUtil::Format("event: ConnectedEvent\ndata: %s\n\n", token));
}

void HttpServer::SendCatalogChangedEvent() {
	SendEvent("event: CatalogChangeEvent\ndata:\n\n");
}

void HttpServer::SendEvent(const std::string &message) {
	if (event_dispatcher_) {
		event_dispatcher_->SendEvent(message);
	}
}

void HttpServer::Run() {
	server_.Get("/localEvents",
	            [&](const httplib::Request &req, httplib::Response &res) { HandleGetLocalEvents(req, res); });
	server_.Get("/localToken",
	            [&](const httplib::Request &req, httplib::Response &res) { HandleGetLocalToken(req, res); });
	server_.Get("/.*", [&](const httplib::Request &req, httplib::Response &res) { HandleGet(req, res); });
	server_.Post("/ddb/interrupt",
	             [&](const httplib::Request &req, httplib::Response &res) { HandleInterrupt(req, res); });
	server_.Post("/ddb/run",
	             [&](const httplib::Request &req, httplib::Response &res,
	                 const httplib::ContentReader &content_reader) { HandleRun(req, res, content_reader); });
	server_.Post("/ddb/tokenize",
	             [&](const httplib::Request &req, httplib::Response &res,
	                 const httplib::ContentReader &content_reader) { HandleTokenize(req, res, content_reader); });
	server_.listen("localhost", local_port_);
}

void HttpServer::HandleGetLocalEvents(const httplib::Request &req, httplib::Response &res) {
	res.set_chunked_content_provider("text/event-stream", [&](size_t /*offset*/, httplib::DataSink &sink) {
		if (event_dispatcher_->WaitEvent(&sink)) {
			return true;
		}
		sink.done();
		return false;
	});
}

void HttpServer::HandleGetLocalToken(const httplib::Request &req, httplib::Response &res) {
	if (!ddb_instance_->ExtensionIsLoaded("motherduck")) {
		res.set_content("", "text/plain"); // UI expects an empty response if the extension is not loaded
		return;
	}

	Connection connection(*ddb_instance_);
	auto query_res = connection.Query("CALL get_md_token()");
	if (query_res->HasError()) {
		res.status = 500;
		res.set_content("Could not get token: " + query_res->GetError(), "text/plain");
		return;
	}

	auto chunk = query_res->Fetch();
	auto token = chunk->GetValue(0, 0).GetValue<std::string>();
	res.status = 200;
	res.set_content(token, "text/plain");
}

void HttpServer::HandleGet(const httplib::Request &req, httplib::Response &res) {
	// Create HTTP client to remote URL
	// TODO: Can this be created once and shared?
	httplib::Client client(remote_url_);
	client.set_keep_alive(true);

	// Provide a way to turn on or off server certificate verification, at least for now, because it requires httplib to
	// correctly get the root certficates on each platform, which doesn't appear to always work.
	// Currently, default to no verification, until we understand when it breaks things.
	if (IsEnvEnabled("ui_enable_server_certificate_verification")) {
		client.enable_server_certificate_verification(true);
	} else {
		client.enable_server_certificate_verification(false);
	}

	// forward GET to remote URL
	auto result = client.Get(req.path, req.params, {{"User-Agent", user_agent_}});
	if (!result) {
		res.status = 500;
		return;
	}

	// Repond with result of forwarded GET
	res = result.value();

	// If this is the config request, set the X-MD-DuckDB-Mode header to HTTP.
	// The UI looks for this to select the appropriate DuckDB mode (HTTP or Wasm).
	if (req.path == "/config") {
		res.set_header("X-MD-DuckDB-Mode", "HTTP");
	}
}

void HttpServer::HandleInterrupt(const httplib::Request &req, httplib::Response &res) {
	auto description = req.get_header_value("X-MD-Description");
	auto connection_name = req.get_header_value("X-MD-Connection-Name");

	auto connection = FindConnection(connection_name);
	if (!connection) {
		res.status = 404;
		return;
	}

	connection->Interrupt();

	SetResponseEmptyResult(res);
}

void HttpServer::HandleRun(const httplib::Request &req, httplib::Response &res,
                             const httplib::ContentReader &content_reader) {
	try {
		auto description = req.get_header_value("X-MD-Description");
		auto connection_name = req.get_header_value("X-MD-Connection-Name");

		auto database_name = DecodeBase64(req.get_header_value("X-MD-Database-Name"));
		auto parameter_count = req.get_header_value_count("X-MD-Parameter");

		std::string content = ReadContent(content_reader);


		auto connection = FindOrCreateConnection(connection_name);

		// Set current database if optional header is provided.
		if (!database_name.empty()) {
			connection->context->RunFunctionInTransaction(
			    [&] { ddb_instance_->GetDatabaseManager().SetDefaultDatabase(*connection->context, database_name); });
		}

		// We use a pending query so we can execute tasks and fetch chunks incrementally.
		// This enables cancellation.
		unique_ptr<PendingQueryResult> pending;

		// Create pending query, with request content as SQL.
		if (parameter_count > 0) {
			auto prepared = connection->Prepare(content);
			if (prepared->HasError()) {
				SetResponseErrorResult(res, prepared->GetError());
				return;
			}

			vector<Value> values;
			for (idx_t i = 0; i < parameter_count; ++i) {
				auto parameter = DecodeBase64(req.get_header_value("X-MD-Parameter", i));
				values.push_back(Value(parameter)); // TODO: support non-string parameters? (SURF-1546)
			}
			pending = prepared->PendingQuery(values, true);
		} else {
			pending = connection->PendingQuery(content, true);
		}

		if (pending->HasError()) {
			SetResponseErrorResult(res, pending->GetError());
			return;
		}

		// Execute tasks until result is ready (or there's an error).
		auto exec_result = PendingExecutionResult::RESULT_NOT_READY;
		while (!PendingQueryResult::IsResultReady(exec_result)) {
			exec_result = pending->ExecuteTask();
			if (exec_result == PendingExecutionResult::BLOCKED ||
			    exec_result == PendingExecutionResult::NO_TASKS_AVAILABLE) {
				std::this_thread::sleep_for(std::chrono::milliseconds(1));
			}
		}

		switch (exec_result) {

		case PendingExecutionResult::EXECUTION_ERROR: {
			SetResponseErrorResult(res, pending->GetError());
		} break;

		case PendingExecutionResult::EXECUTION_FINISHED:
		case PendingExecutionResult::RESULT_READY: {
			// Get the result. This should be quick because it's ready.
			auto result = pending->Execute();

			// Fetch the chunks and serialize the result.
			SuccessResult success_result;
			success_result.column_names_and_types = {std::move(result->names), std::move(result->types)};

			// TODO: support limiting the number of chunks fetched (SURF-1540)
			auto chunk = result->Fetch();
			while (chunk) {
				success_result.chunks.push_back({static_cast<uint16_t>(chunk->size()), std::move(chunk->data)});
				chunk = result->Fetch();
			}

			MemoryStream success_response_content;
			BinarySerializer::Serialize(success_result, success_response_content);
			SetResponseContent(res, success_response_content);
		} break;

		default: {
			SetResponseErrorResult(res, "Unexpected PendingExecutionResult");
		} break;
		}

	} catch (const std::exception &ex) {
		SetResponseErrorResult(res, ex.what());
	}
}

void HttpServer::HandleTokenize(const httplib::Request &req, httplib::Response &res,
                                  const httplib::ContentReader &content_reader) {
	auto description = req.get_header_value("X-MD-Description");

	std::string content = ReadContent(content_reader);


	auto tokens = Parser::Tokenize(content);

	// Read and serialize result
	TokenizeResult result;
	result.offsets.reserve(tokens.size());
	result.types.reserve(tokens.size());

	for (auto token : tokens) {
		result.offsets.push_back(token.start);
		result.types.push_back(token.type);
	}

	MemoryStream response_content;
	BinarySerializer::Serialize(result, response_content);
	SetResponseContent(res, response_content);
}

std::string HttpServer::ReadContent(const httplib::ContentReader &content_reader) {
	std::ostringstream oss;
	content_reader([&](const char *data, size_t data_length) {
		oss.write(data, data_length);
		return true;
	});
	return oss.str();
}

shared_ptr<Connection> HttpServer::FindConnection(const std::string &connection_name) {
	if (connection_name.empty()) {
		return nullptr;
	}

	// Need to protect access to the connections map because this can be called from multiple threads.
	std::lock_guard<std::mutex> guard(connections_mutex_);

	auto result = connections_.find(connection_name);
	if (result != connections_.end()) {
		return result->second;
	}

	return nullptr;
}

shared_ptr<Connection> HttpServer::FindOrCreateConnection(const std::string &connection_name) {
	if (connection_name.empty()) {
		// If no connection name was provided, create and return a new connection but don't remember it.
		return make_shared_ptr<Connection>(*ddb_instance_);
	}

	// Need to protect access to the connections map because this can be called from multiple threads.
	std::lock_guard<std::mutex> guard(connections_mutex_);

	// If an existing connection with the provided name was found, return it.
	auto result = connections_.find(connection_name);
	if (result != connections_.end()) {
		return result->second;
	}

	// Otherwise, create a new one, remember it, and return it.
	auto connection = make_shared_ptr<Connection>(*ddb_instance_);
	connections_[connection_name] = connection;
	return connection;
}

void HttpServer::SetResponseContent(httplib::Response &res, const MemoryStream &content) {
	auto data = content.GetData();
	auto length = content.GetPosition();
	res.set_content(reinterpret_cast<const char *>(data), length, "application/octet-stream");
}

void HttpServer::SetResponseEmptyResult(httplib::Response &res) {
	EmptyResult empty_result;
	MemoryStream response_content;
	BinarySerializer::Serialize(empty_result, response_content);
	SetResponseContent(res, response_content);
}

void HttpServer::SetResponseErrorResult(httplib::Response &res, const std::string &error) {
	ErrorResult error_result;
	error_result.error = error;
	MemoryStream response_content;
	BinarySerializer::Serialize(error_result, response_content);
	SetResponseContent(res, response_content);
}

} // namespace ui
} // namespace md
