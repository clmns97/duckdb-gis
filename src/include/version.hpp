#pragma once

#ifndef GIS_EXTENSION_SEQ_NUM
#error "GIS_EXTENSION_SEQ_NUM must be defined"
#endif
#ifndef GIS_EXTENSION_GIT_SHA
#error "GIS_EXTENSION_GIT_SHA must be defined"
#endif
#define GIS_EXTENSION_VERSION GIS_EXTENSION_SEQ_NUM "-" GIS_EXTENSION_GIT_SHA
