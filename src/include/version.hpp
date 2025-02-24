#pragma once

#ifndef UI_EXTENSION_SEQ_NUM
#error "UI_EXTENSION_SEQ_NUM must be defined"
#endif
#ifndef UI_EXTENSION_GIT_SHA
#error "UI_EXTENSION_GIT_SHA must be defined"
#endif
#define UI_EXTENSION_VERSION UI_EXTENSION_SEQ_NUM "-" UI_EXTENSION_GIT_SHA
