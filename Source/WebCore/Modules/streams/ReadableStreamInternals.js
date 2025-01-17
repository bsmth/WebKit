/*
 * Copyright (C) 2015 Canon Inc. All rights reserved.
 * Copyright (C) 2015 Igalia.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// @internal

function createInternalReadableStreamFromUnderlyingSource(underlyingSource, strategy)
{
    "use strict";

    const stream = { };

    if (underlyingSource === @undefined)
         underlyingSource = { };
     if (strategy === @undefined)
         strategy = { };

    if (!@isObject(underlyingSource))
        @throwTypeError("ReadableStream constructor takes an object as first argument");

    if (strategy !== @undefined && !@isObject(strategy))
        @throwTypeError("ReadableStream constructor takes an object as second argument, if any");

    @putByIdDirectPrivate(stream, "state", @streamReadable);
    @putByIdDirectPrivate(stream, "reader", @undefined);
    @putByIdDirectPrivate(stream, "storedError", @undefined);
    @putByIdDirectPrivate(stream, "disturbed", false);
    // Initialized with null value to enable distinction with undefined case.
    @putByIdDirectPrivate(stream, "readableStreamController", null);
    @putByIdDirectPrivate(stream, "globalObject", @getGlobalObject());

    // FIXME: We should introduce https://streams.spec.whatwg.org/#create-readable-stream.
    // For now, we emulate this with underlyingSource with private properties.
    if (underlyingSource.@pull !== @undefined) {
        const size = @getByIdDirectPrivate(strategy, "size");
        const highWaterMark = @getByIdDirectPrivate(strategy, "highWaterMark");
        @setupReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark !== @undefined ? highWaterMark : 1, underlyingSource.@start, underlyingSource.@pull, underlyingSource.@cancel);
        return stream;
    }

    const type = underlyingSource.type;
    const typeString = @toString(type);

    if (typeString === "bytes") {
        if (!@readableByteStreamAPIEnabled())
            @throwTypeError("ReadableByteStreamController is not implemented");

        if (strategy.highWaterMark === @undefined)
            strategy.highWaterMark = 0;
        if (strategy.size !== @undefined)
            @throwRangeError("Strategy for a ReadableByteStreamController cannot have a size");

        let readableByteStreamControllerConstructor = @ReadableByteStreamController;
        @putByIdDirectPrivate(stream, "readableStreamController", new @ReadableByteStreamController(stream, underlyingSource, strategy.highWaterMark, @isReadableStream));
    } else if (type === @undefined) {
        let highWaterMark = strategy.highWaterMark;
        if (highWaterMark !== @undefined)
            highWaterMark = @toNumber(highWaterMark);
        else
            highWaterMark = 1;
        const size = strategy.size;
        if (size !== @undefined && !@isCallable(size))
            @throwTypeError("size parameter must be a function");

        const cancel = underlyingSource.cancel;
        if (cancel !== @undefined && !@isCallable(cancel))
            @throwTypeError("underlyingSource cancel must be a function");
        const pull = underlyingSource.pull;
        if (pull !== @undefined && !@isCallable(pull))
            @throwTypeError("underlyingSource pull must be a function");
        const start = underlyingSource.start;
        if (start !== @undefined && !@isCallable(start))
            @throwTypeError("underlyingSource start must be a function");

        @setupReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark, start, pull, cancel);
    } else
        @throwTypeError("Invalid type for underlying source");

    return stream;
}

function readableStreamGetReaderForBindings(stream, options)
{
    "use strict";

    @assert(@isReadableStream(stream));

    const mode = @toDictionary(options, { }, "ReadableStream.getReader takes an object as first argument").mode;
    const readableStreamGlobalObject = @getByIdDirectPrivate(stream, "globalObject");

    if (mode === @undefined) {
        const readableStreamDefaultReaderConstructor = @getByIdDirectPrivate(readableStreamGlobalObject, "ReadableStreamDefaultReader");
        return new readableStreamDefaultReaderConstructor(stream);
    }

    // String conversion is required by spec, hence double equals.
    if (mode == 'byob') {
        const readableStreamBYOBReaderConstructor = @getByIdDirectPrivate(readableStreamGlobalObject, "ReadableStreamBYOBReader");
        return new readableStreamBYOBReaderConstructor(stream);
    }

    @throwTypeError("Invalid mode is specified");
}

function readableStreamCancelForBindings(stream, reason)
{
    "use strict";

    @assert(@isReadableStream(stream));

    if (@isReadableStreamLocked(stream))
        return @Promise.@reject(@makeTypeError("ReadableStream is locked"));

    return @readableStreamCancel(stream, reason);
}

function readableStreamPipeThroughForBindings(thisStream, streams, options)
{
    "use strict";

    @assert(@isReadableStream(thisStream));

    const transforms = streams;

    const readable = transforms["readable"];
    const internalReadable = @getInternalReadableStream(readable);
    if (!@isReadableStream(internalReadable))
        throw @makeTypeError("readable should be ReadableStream");

    const writable = transforms["writable"];
    const internalWritable = @getInternalWritableStream(writable);
    if (!@isWritableStream(internalWritable))
        throw @makeTypeError("writable should be WritableStream");

    let preventClose = false;
    let preventAbort = false;
    let preventCancel = false;
    let signal;
    if (!@isUndefinedOrNull(options)) {
        if (!@isObject(options))
            throw @makeTypeError("options must be an object");

        preventAbort = !!options["preventAbort"];
        preventCancel = !!options["preventCancel"];
        preventClose = !!options["preventClose"];

        signal = options["signal"];
        if (signal !== @undefined && !@isAbortSignal(signal))
            throw @makeTypeError("options.signal must be AbortSignal");
    }

    if (@isReadableStreamLocked(thisStream))
        throw @makeTypeError("ReadableStream is locked");

    if (@isWritableStreamLocked(internalWritable))
        throw @makeTypeError("WritableStream is locked");

    const promise = @readableStreamPipeToWritableStream(thisStream, internalWritable, preventClose, preventAbort, preventCancel, signal);
    @markPromiseAsHandled(promise);

    return readable;
}

function readableStreamPipeToForBindings(stream, destination, options)
{
    "use strict";

    @assert(@isReadableStream(stream));

    let preventClose = false;
    let preventAbort = false;
    let preventCancel = false;
    let signal;
    if (!@isUndefinedOrNull(options)) {
        if (!@isObject(options))
            return @Promise.@reject(@makeTypeError("options must be an object"));

        try {
            preventAbort = !!options["preventAbort"];
            preventCancel = !!options["preventCancel"];
            preventClose = !!options["preventClose"];

            signal = options["signal"];
        } catch(e) {
            return @Promise.@reject(e);
        }

        if (signal !== @undefined && !@isAbortSignal(signal))
            return @Promise.@reject(@makeTypeError("options.signal must be AbortSignal"));
    }

    const internalDestination = @getInternalWritableStream(destination);
    if (!@isWritableStream(internalDestination))
        return @Promise.@reject(@makeTypeError("ReadableStream pipeTo requires a WritableStream"));

    if (@isReadableStreamLocked(stream))
        return @Promise.@reject(@makeTypeError("ReadableStream is locked"));

    if (@isWritableStreamLocked(internalDestination))
        return @Promise.@reject(@makeTypeError("WritableStream is locked"));

    return @readableStreamPipeToWritableStream(stream, internalDestination, preventClose, preventAbort, preventCancel, signal);
}

function readableStreamReaderGenericInitialize(reader, stream)
{
    "use strict";

    @putByIdDirectPrivate(reader, "ownerReadableStream", stream);
    @putByIdDirectPrivate(stream, "reader", reader);
    if (@getByIdDirectPrivate(stream, "state") === @streamReadable)
        @putByIdDirectPrivate(reader, "closedPromiseCapability", @newPromiseCapability(@Promise));
    else if (@getByIdDirectPrivate(stream, "state") === @streamClosed)
        @putByIdDirectPrivate(reader, "closedPromiseCapability", { @promise: @Promise.@resolve() });
    else {
        @assert(@getByIdDirectPrivate(stream, "state") === @streamErrored);
        @putByIdDirectPrivate(reader, "closedPromiseCapability", { @promise: @newHandledRejectedPromise(@getByIdDirectPrivate(stream, "storedError")) });
    }
}

function privateInitializeReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark)
{
    "use strict";

    if (!@isReadableStream(stream))
        @throwTypeError("ReadableStreamDefaultController needs a ReadableStream");

    // readableStreamController is initialized with null value.
    if (@getByIdDirectPrivate(stream, "readableStreamController") !== null)
        @throwTypeError("ReadableStream already has a controller");

    @putByIdDirectPrivate(this, "controlledReadableStream", stream);
    @putByIdDirectPrivate(this, "underlyingSource", underlyingSource);
    @putByIdDirectPrivate(this, "queue", @newQueue());
    @putByIdDirectPrivate(this, "started", false);
    @putByIdDirectPrivate(this, "closeRequested", false);
    @putByIdDirectPrivate(this, "pullAgain", false);
    @putByIdDirectPrivate(this, "pulling", false);
    @putByIdDirectPrivate(this, "strategy", @validateAndNormalizeQueuingStrategy(size, highWaterMark));

    return this;
}

// https://streams.spec.whatwg.org/#set-up-readable-stream-default-controller, starting from step 6.
// The other part is implemented in privateInitializeReadableStreamDefaultController.
function setupReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark, startMethod, pullMethod, cancelMethod)
{
    "use strict";
    const controller = new @ReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark, @isReadableStream);
    const startAlgorithm = () => @promiseInvokeOrNoopMethodNoCatch(underlyingSource, startMethod, [controller]);
    const pullAlgorithm = () => @promiseInvokeOrNoopMethod(underlyingSource, pullMethod, [controller]);
    const cancelAlgorithm = (reason) => @promiseInvokeOrNoopMethod(underlyingSource, cancelMethod, [reason]);

    @putByIdDirectPrivate(controller, "pullAlgorithm", pullAlgorithm);
    @putByIdDirectPrivate(controller, "cancelAlgorithm", cancelAlgorithm);
    @putByIdDirectPrivate(controller, "pull", @readableStreamDefaultControllerPull);
    @putByIdDirectPrivate(controller, "cancel", @readableStreamDefaultControllerCancel);
    @putByIdDirectPrivate(stream, "readableStreamController", controller);

    startAlgorithm().@then(() => {
        @putByIdDirectPrivate(controller, "started", true);
        @assert(!@getByIdDirectPrivate(controller, "pulling"));
        @assert(!@getByIdDirectPrivate(controller, "pullAgain"));
        @readableStreamDefaultControllerCallPullIfNeeded(controller);
    }, (error) => {
        @readableStreamDefaultControllerError(controller, error);
    });
}

function readableStreamDefaultControllerError(controller, error)
{
    "use strict";

    const stream = @getByIdDirectPrivate(controller, "controlledReadableStream");
    if (@getByIdDirectPrivate(stream, "state") !== @streamReadable)
        return;
    @putByIdDirectPrivate(controller, "queue", @newQueue());
    @readableStreamError(stream, error);
}

function readableStreamPipeTo(stream, sink)
{
    "use strict";
    @assert(@isReadableStream(stream));

    const reader = @acquireReadableStreamDefaultReader(stream);

    @getByIdDirectPrivate(reader, "closedPromiseCapability").@promise.@then(() => { }, (e) => { sink.error(e); });

    function doPipe() {
        @readableStreamDefaultReaderRead(reader).@then(function(result) {
            if (result.done) {
                sink.close();
                return;
            }
            try {
                sink.enqueue(result.value);
            } catch (e) {
                sink.error("ReadableStream chunk enqueueing in the sink failed");
                return;
            }
            doPipe();
        }, function(e) {
            sink.error(e);
        });
    }
    doPipe();
}

function acquireReadableStreamDefaultReader(stream)
{
    const readableStreamGlobalObject = @getByIdDirectPrivate(stream, "globalObject");
    const readableStreamDefaultReaderConstructor = @getByIdDirectPrivate(readableStreamGlobalObject, "ReadableStreamDefaultReader");
    return new readableStreamDefaultReaderConstructor(stream);
}

// FIXME: Replace readableStreamPipeTo by below function.
// This method implements the latest https://streams.spec.whatwg.org/#readable-stream-pipe-to.
function readableStreamPipeToWritableStream(source, destination, preventClose, preventAbort, preventCancel, signal)
{
    @assert(@isReadableStream(source));
    @assert(@isWritableStream(destination));
    @assert(!@isReadableStreamLocked(source));
    @assert(!@isWritableStreamLocked(destination));
    @assert(signal === @undefined || @isAbortSignal(signal));

    if (@getByIdDirectPrivate(source, "underlyingByteSource") !== @undefined)
        return @Promise.@reject("Piping of readable by strean is not supported");

    let pipeState = { source : source, destination : destination, preventAbort : preventAbort, preventCancel : preventCancel, preventClose : preventClose, signal : signal };

    pipeState.reader = @acquireReadableStreamDefaultReader(source);
    pipeState.writer = @acquireWritableStreamDefaultWriter(destination);

    @putByIdDirectPrivate(source, "disturbed", true);

    pipeState.shuttingDown = false;
    pipeState.promiseCapability = @newPromiseCapability(@Promise);
    pipeState.pendingReadPromiseCapability = @newPromiseCapability(@Promise);
    pipeState.pendingReadPromiseCapability.@resolve.@call();
    pipeState.pendingWritePromise = @Promise.@resolve();

    if (signal !== @undefined) {
        const algorithm = (reason) => {
            @pipeToShutdownWithAction(pipeState, () => {
                const shouldAbortDestination = !pipeState.preventAbort && @getByIdDirectPrivate(pipeState.destination, "state") === "writable";
                const promiseDestination = shouldAbortDestination ? @writableStreamAbort(pipeState.destination, reason) : @Promise.@resolve();

                const shouldAbortSource = !pipeState.preventCancel && @getByIdDirectPrivate(pipeState.source, "state") === @streamReadable;
                const promiseSource = shouldAbortSource ? @readableStreamCancel(pipeState.source, reason) : @Promise.@resolve();

                let promiseCapability = @newPromiseCapability(@Promise);
                let shouldWait = true;
                let handleResolvedPromise = () => {
                    if (shouldWait) {
                        shouldWait = false;
                        return;
                    }
                    promiseCapability.@resolve.@call();
                }
                let handleRejectedPromise = (e) => {
                    promiseCapability.@reject.@call(@undefined, e);
                }
                promiseDestination.@then(handleResolvedPromise, handleRejectedPromise);
                promiseSource.@then(handleResolvedPromise, handleRejectedPromise);
                return promiseCapability.@promise;
            }, reason);
        };
        pipeState.abortAlgorithmIdentifier = @addAbortAlgorithmToSignal(signal, algorithm)
        if (!pipeState.abortAlgorithmIdentifier)
            return pipeState.promiseCapability.@promise;
        pipeState.signal = signal;
    }

    @pipeToErrorsMustBePropagatedForward(pipeState);
    @pipeToErrorsMustBePropagatedBackward(pipeState);
    @pipeToClosingMustBePropagatedForward(pipeState);
    @pipeToClosingMustBePropagatedBackward(pipeState);

    @pipeToLoop(pipeState);

    return pipeState.promiseCapability.@promise;
}

function pipeToLoop(pipeState)
{
    if (pipeState.shuttingDown)
        return;

    @pipeToDoReadWrite(pipeState).@then((result) => {
        if (result)
            @pipeToLoop(pipeState);
    });
}

function pipeToDoReadWrite(pipeState)
{
    @assert(!pipeState.shuttingDown);

    pipeState.pendingReadPromiseCapability = @newPromiseCapability(@Promise);
    @getByIdDirectPrivate(pipeState.writer, "readyPromise").@promise.@then(() => {
        if (pipeState.shuttingDown) {
            pipeState.pendingReadPromiseCapability.@resolve.@call(@undefined, false);
            return;
        }

        @readableStreamDefaultReaderRead(pipeState.reader).@then((result) => {
            const canWrite = !result.done && @getByIdDirectPrivate(pipeState.writer, "stream") !== @undefined;
            pipeState.pendingReadPromiseCapability.@resolve.@call(@undefined, canWrite);
            if (!canWrite)
                return;

            pipeState.pendingWritePromise = @writableStreamDefaultWriterWrite(pipeState.writer, result.value).@then(@undefined, () => { });
        }, (e) => {
            pipeState.pendingReadPromiseCapability.@resolve.@call(@undefined, false);
        });
    }, (e) => {
        pipeState.pendingReadPromiseCapability.@resolve.@call(@undefined, false);
    });
    return pipeState.pendingReadPromiseCapability.@promise;
}

function pipeToErrorsMustBePropagatedForward(pipeState)
{
    const action = () => {
        pipeState.pendingReadPromiseCapability.@resolve.@call(@undefined, false);
        const error = @getByIdDirectPrivate(pipeState.source, "storedError");
        if (!pipeState.preventAbort) {
            @pipeToShutdownWithAction(pipeState, () => @writableStreamAbort(pipeState.destination, error), error);
            return;
        }
        @pipeToShutdown(pipeState, error);
    };

    if (@getByIdDirectPrivate(pipeState.source, "state") === @streamErrored) {
        action();
        return;
    }

    @getByIdDirectPrivate(pipeState.reader, "closedPromiseCapability").@promise.@then(@undefined, action);
}

function pipeToErrorsMustBePropagatedBackward(pipeState)
{
    const action = () => {
        const error = @getByIdDirectPrivate(pipeState.destination, "storedError");
        if (!pipeState.preventCancel) {
            @pipeToShutdownWithAction(pipeState, () => @readableStreamCancel(pipeState.source, error), error);
            return;
        }
        @pipeToShutdown(pipeState, error);
    };
    if (@getByIdDirectPrivate(pipeState.destination, "state") === "errored") {
        action();
        return;
    }
    @getByIdDirectPrivate(pipeState.writer, "closedPromise").@promise.@then(@undefined, action);
}

function pipeToClosingMustBePropagatedForward(pipeState)
{
    const action = () => {
        pipeState.pendingReadPromiseCapability.@resolve.@call(@undefined, false);
        const error = @getByIdDirectPrivate(pipeState.source, "storedError");
        if (!pipeState.preventClose) {
            @pipeToShutdownWithAction(pipeState, () => @writableStreamDefaultWriterCloseWithErrorPropagation(pipeState.writer));
            return;
        }
        @pipeToShutdown(pipeState);
    };
    if (@getByIdDirectPrivate(pipeState.source, "state") === @streamClosed) {
        action();
        return;
    }
    @getByIdDirectPrivate(pipeState.reader, "closedPromiseCapability").@promise.@then(action, () => { });
}

function pipeToClosingMustBePropagatedBackward(pipeState)
{
    if (!@writableStreamCloseQueuedOrInFlight(pipeState.destination) && @getByIdDirectPrivate(pipeState.destination, "state") !== "closed")
        return;

    // @assert no chunks have been read/written

    const error = @makeTypeError("closing is propagated backward");
    if (!pipeState.preventCancel) {
        @pipeToShutdownWithAction(pipeState, () => @readableStreamCancel(pipeState.source, error), error);
        return;
    }
    @pipeToShutdown(pipeState, error);
}

function pipeToShutdownWithAction(pipeState, action)
{
    if (pipeState.shuttingDown)
        return;

    pipeState.shuttingDown = true;

    const hasError = arguments.length > 2;
    const error = arguments[2];
    const finalize = () => {
        const promise = action();
        promise.@then(() => {
            if (hasError)
                @pipeToFinalize(pipeState, error);
            else
                @pipeToFinalize(pipeState);
        }, (e)  => {
            @pipeToFinalize(pipeState, e);
        });
    };

    if (@getByIdDirectPrivate(pipeState.destination, "state") === "writable" && !@writableStreamCloseQueuedOrInFlight(pipeState.destination)) {
        pipeState.pendingReadPromiseCapability.@promise.@then(() => {
            pipeState.pendingWritePromise.@then(finalize, finalize);
        }, (e) => @pipeToFinalize(pipeState, e));
        return;
    }

    finalize();
}

function pipeToShutdown(pipeState)
{
    if (pipeState.shuttingDown)
        return;

    pipeState.shuttingDown = true;

    const hasError = arguments.length > 1;
    const error = arguments[1];
    const finalize = () => {
        if (hasError)
            @pipeToFinalize(pipeState, error);
        else
            @pipeToFinalize(pipeState);
    };

    if (@getByIdDirectPrivate(pipeState.destination, "state") === "writable" && !@writableStreamCloseQueuedOrInFlight(pipeState.destination)) {
        pipeState.pendingReadPromiseCapability.@promise.@then(() => {
            pipeState.pendingWritePromise.@then(finalize, finalize);
        }, (e) => @pipeToFinalize(pipeState, e));
        return;
    }
    finalize();
}

function pipeToFinalize(pipeState)
{
    @writableStreamDefaultWriterRelease(pipeState.writer);
    @readableStreamReaderGenericRelease(pipeState.reader);

    if (pipeState.signal)
        @removeAbortAlgorithmFromSignal(pipeState.signal, pipeState.abortAlgorithmIdentifier)

    if (arguments.length > 1)
        pipeState.promiseCapability.@reject.@call(@undefined, arguments[1]);
    else
        pipeState.promiseCapability.@resolve.@call();
}

function readableStreamTee(stream, shouldClone)
{
    "use strict";

    @assert(@isReadableStream(stream));
    @assert(typeof(shouldClone) === "boolean");

    const reader = @acquireReadableStreamDefaultReader(stream);

    const teeState = {
        stream: stream,
        canceled1: false,
        canceled2: false,
        reason1: @undefined,
        reason2: @undefined,
        reading: false,
        readAgain: false,
    };

    teeState.cancelPromiseCapability = @newPromiseCapability(@Promise);

    const pullFunction = @readableStreamTeePullFunction(teeState, reader, shouldClone);

    const branch1Source = { };
    @putByIdDirectPrivate(branch1Source, "pull", pullFunction);
    @putByIdDirectPrivate(branch1Source, "cancel", @readableStreamTeeBranch1CancelFunction(teeState, stream));

    const branch2Source = { };
    @putByIdDirectPrivate(branch2Source, "pull", pullFunction);
    @putByIdDirectPrivate(branch2Source, "cancel", @readableStreamTeeBranch2CancelFunction(teeState, stream));

    const branch1 = @createInternalReadableStreamFromUnderlyingSource(branch1Source);
    const branch2 = @createInternalReadableStreamFromUnderlyingSource(branch2Source);

    @getByIdDirectPrivate(reader, "closedPromiseCapability").@promise.@then(@undefined, function(e) {
        @readableStreamDefaultControllerError(branch1.@readableStreamController, e);
        @readableStreamDefaultControllerError(branch2.@readableStreamController, e);
        if (!teeState.canceled1 || !teeState.canceled2)
            teeState.cancelPromiseCapability.@resolve.@call();
    });

    // Additional fields compared to the spec, as they are needed within pull/cancel functions.
    teeState.branch1 = branch1;
    teeState.branch2 = branch2;

    return [branch1, branch2];
}

function readableStreamTeePullFunction(teeState, reader, shouldClone)
{
    "use strict";

    const pullAlgorithm = function() {
        if (teeState.reading) {
            teeState.readAgain = true;
            return @Promise.@resolve();
        }
        teeState.reading = true;
        @Promise.prototype.@then.@call(@readableStreamDefaultReaderRead(reader), function(result) {
            @assert(@isObject(result));
            @assert(typeof result.done === "boolean");
            if (result.done) {
                // close steps.
                teeState.reading = false;
                if (!teeState.canceled1)
                    @readableStreamDefaultControllerClose(teeState.branch1.@readableStreamController);
                if (!teeState.canceled2)
                    @readableStreamDefaultControllerClose(teeState.branch2.@readableStreamController);
                if (!teeState.canceled1 || !teeState.canceled2)
                    teeState.cancelPromiseCapability.@resolve.@call();
                return;
            }
            // chunk steps.
            teeState.readAgain = false;
            let chunk1 = result.value;
            let chunk2 = result.value;
            if (!teeState.canceled2 && shouldClone) {
                try {
                    chunk2 = @structuredCloneForStream(result.value);
                } catch (e) {
                    @readableStreamDefaultControllerError(teeState.branch1.@readableStreamController, e);
                    @readableStreamDefaultControllerError(teeState.branch2.@readableStreamController, e);
                    @readableStreamCancel(teeState.stream, e).@then(teeState.cancelPromiseCapability.@resolve, teeState.cancelPromiseCapability.@reject);
                    return;
                }
            }
            if (!teeState.canceled1)
                @readableStreamDefaultControllerEnqueue(teeState.branch1.@readableStreamController, chunk1);
            if (!teeState.canceled2)
                @readableStreamDefaultControllerEnqueue(teeState.branch2.@readableStreamController, chunk2);
            teeState.reading = false

            @Promise.@resolve().@then(() => {
                if (teeState.readAgain)
                    pullAlgorithm();
            });
        }, () => {
            // error steps.
            teeState.reading = false
        });
        return @Promise.@resolve();
    }
    return pullAlgorithm;
}

function readableStreamTeeBranch1CancelFunction(teeState, stream)
{
    "use strict";

    return function(r) {
        teeState.canceled1 = true;
        teeState.reason1 = r;
        if (teeState.canceled2) {
            @readableStreamCancel(stream, [teeState.reason1, teeState.reason2]).@then(
                teeState.cancelPromiseCapability.@resolve,
                teeState.cancelPromiseCapability.@reject);
        }
        return teeState.cancelPromiseCapability.@promise;
    }
}

function readableStreamTeeBranch2CancelFunction(teeState, stream)
{
    "use strict";

    return function(r) {
        teeState.canceled2 = true;
        teeState.reason2 = r;
        if (teeState.canceled1) {
            @readableStreamCancel(stream, [teeState.reason1, teeState.reason2]).@then(
                teeState.cancelPromiseCapability.@resolve,
                teeState.cancelPromiseCapability.@reject);
        }
        return teeState.cancelPromiseCapability.@promise;
    }
}

function isReadableStream(stream)
{
    "use strict";

    // Spec tells to return true only if stream has a readableStreamController internal slot.
    // However, since it is a private slot, it cannot be checked using hasOwnProperty().
    // Therefore, readableStreamController is initialized with null value.
    return @isObject(stream) && @getByIdDirectPrivate(stream, "readableStreamController") !== @undefined;
}

function isReadableStreamDefaultReader(reader)
{
    "use strict";

    // Spec tells to return true only if reader has a readRequests internal slot.
    // However, since it is a private slot, it cannot be checked using hasOwnProperty().
    // Since readRequests is initialized with an empty array, the following test is ok.
    return @isObject(reader) && !!@getByIdDirectPrivate(reader, "readRequests");
}

function isReadableStreamDefaultController(controller)
{
    "use strict";

    // Spec tells to return true only if controller has an underlyingSource internal slot.
    // However, since it is a private slot, it cannot be checked using hasOwnProperty().
    // underlyingSource is obtained in ReadableStream constructor: if undefined, it is set
    // to an empty object. Therefore, following test is ok.
    return @isObject(controller) && !!@getByIdDirectPrivate(controller, "underlyingSource");
}

function readableStreamError(stream, error)
{
    "use strict";

    @assert(@isReadableStream(stream));
    @assert(@getByIdDirectPrivate(stream, "state") === @streamReadable);
    @putByIdDirectPrivate(stream, "state", @streamErrored);
    @putByIdDirectPrivate(stream, "storedError", error);

    if (!@getByIdDirectPrivate(stream, "reader"))
        return;

    const reader = @getByIdDirectPrivate(stream, "reader");

    @getByIdDirectPrivate(reader, "closedPromiseCapability").@reject.@call(@undefined, error);
    const promise = @getByIdDirectPrivate(reader, "closedPromiseCapability").@promise;
    @markPromiseAsHandled(promise);

    if (@isReadableStreamDefaultReader(reader))
        @readableStreamDefaultReaderErrorReadRequests(reader, error);
    else {
        @assert(@isReadableStreamBYOBReader(reader));
        const requests = @getByIdDirectPrivate(reader, "readIntoRequests");
        @putByIdDirectPrivate(reader, "readIntoRequests", []);
        for (let index = 0, length = requests.length; index < length; ++index)
            @rejectPromise(requests[index], error);
    }
}

function readableStreamDefaultControllerShouldCallPull(controller)
{
    const stream = @getByIdDirectPrivate(controller, "controlledReadableStream");

    if (!@readableStreamDefaultControllerCanCloseOrEnqueue(controller))
        return false;
    if (!@getByIdDirectPrivate(controller, "started"))
        return false;
    if ((!@isReadableStreamLocked(stream) || !@getByIdDirectPrivate(@getByIdDirectPrivate(stream, "reader"), "readRequests").length) && @readableStreamDefaultControllerGetDesiredSize(controller) <= 0)
        return false;
    const desiredSize = @readableStreamDefaultControllerGetDesiredSize(controller);
    @assert(desiredSize !== null);
    return desiredSize > 0;
}

function readableStreamDefaultControllerCallPullIfNeeded(controller)
{
    "use strict";

    // FIXME: use @readableStreamDefaultControllerShouldCallPull
    const stream = @getByIdDirectPrivate(controller, "controlledReadableStream");

    if (!@readableStreamDefaultControllerCanCloseOrEnqueue(controller))
        return;
    if (!@getByIdDirectPrivate(controller, "started"))
        return;
    if ((!@isReadableStreamLocked(stream) || !@getByIdDirectPrivate(@getByIdDirectPrivate(stream, "reader"), "readRequests").length) && @readableStreamDefaultControllerGetDesiredSize(controller) <= 0)
        return;

    if (@getByIdDirectPrivate(controller, "pulling")) {
        @putByIdDirectPrivate(controller, "pullAgain", true);
        return;
    }

    @assert(!@getByIdDirectPrivate(controller, "pullAgain"));
    @putByIdDirectPrivate(controller, "pulling", true);

    @getByIdDirectPrivate(controller, "pullAlgorithm").@call(@undefined).@then(function() {
        @putByIdDirectPrivate(controller, "pulling", false);
        if (@getByIdDirectPrivate(controller, "pullAgain")) {
            @putByIdDirectPrivate(controller, "pullAgain", false);
            @readableStreamDefaultControllerCallPullIfNeeded(controller);
        }
    }, function(error) {
        @readableStreamDefaultControllerError(controller, error);
    });
}

function isReadableStreamLocked(stream)
{
   "use strict";

    @assert(@isReadableStream(stream));
    return !!@getByIdDirectPrivate(stream, "reader");
}

function readableStreamDefaultControllerGetDesiredSize(controller)
{
   "use strict";

    const stream = @getByIdDirectPrivate(controller, "controlledReadableStream");
    const state = @getByIdDirectPrivate(stream, "state");

    if (state === @streamErrored)
        return null;
    if (state === @streamClosed)
        return 0;

    return @getByIdDirectPrivate(controller, "strategy").highWaterMark - @getByIdDirectPrivate(controller, "queue").size;
}


function readableStreamReaderGenericCancel(reader, reason)
{
    "use strict";

    const stream = @getByIdDirectPrivate(reader, "ownerReadableStream");
    @assert(!!stream);
    return @readableStreamCancel(stream, reason);
}

function readableStreamCancel(stream, reason)
{
    "use strict";

    @putByIdDirectPrivate(stream, "disturbed", true);
    const state = @getByIdDirectPrivate(stream, "state");
    if (state === @streamClosed)
        return @Promise.@resolve();
    if (state === @streamErrored)
        return @Promise.@reject(@getByIdDirectPrivate(stream, "storedError"));
    @readableStreamClose(stream);
    return @getByIdDirectPrivate(stream, "readableStreamController").@cancel(@getByIdDirectPrivate(stream, "readableStreamController"), reason).@then(function() {  });
}

function readableStreamDefaultControllerCancel(controller, reason)
{
    "use strict";

    @putByIdDirectPrivate(controller, "queue", @newQueue());
    return @getByIdDirectPrivate(controller, "cancelAlgorithm").@call(@undefined, reason);
}

function readableStreamDefaultControllerPull(controller)
{
    "use strict";

    const stream = @getByIdDirectPrivate(controller, "controlledReadableStream");
    if (@getByIdDirectPrivate(controller, "queue").content.length) {
        const chunk = @dequeueValue(@getByIdDirectPrivate(controller, "queue"));
        if (@getByIdDirectPrivate(controller, "closeRequested") && @getByIdDirectPrivate(controller, "queue").content.length === 0)
            @readableStreamClose(stream);
        else
            @readableStreamDefaultControllerCallPullIfNeeded(controller);

        return @createFulfilledPromise({ value: chunk, done: false });
    }
    const pendingPromise = @readableStreamAddReadRequest(stream);
    @readableStreamDefaultControllerCallPullIfNeeded(controller);
    return pendingPromise;
}

function readableStreamDefaultControllerClose(controller)
{
    "use strict";

    @assert(@readableStreamDefaultControllerCanCloseOrEnqueue(controller));
    @putByIdDirectPrivate(controller, "closeRequested", true);
    if (@getByIdDirectPrivate(controller, "queue").content.length === 0)
        @readableStreamClose(@getByIdDirectPrivate(controller, "controlledReadableStream"));
}

function readableStreamClose(stream)
{
    "use strict";

    @assert(@getByIdDirectPrivate(stream, "state") === @streamReadable);
    @putByIdDirectPrivate(stream, "state", @streamClosed);
    const reader = @getByIdDirectPrivate(stream, "reader");

    if (!reader)
        return;

    if (@isReadableStreamDefaultReader(reader)) {
        const requests = @getByIdDirectPrivate(reader, "readRequests");
        @putByIdDirectPrivate(reader, "readRequests", []);
        for (let index = 0, length = requests.length; index < length; ++index)
            @fulfillPromise(requests[index], { value: @undefined, done: true });
    }

    @getByIdDirectPrivate(reader, "closedPromiseCapability").@resolve.@call();
}

function readableStreamFulfillReadRequest(stream, chunk, done)
{
    "use strict";
    const readRequest = @getByIdDirectPrivate(@getByIdDirectPrivate(stream, "reader"), "readRequests").@shift();
    @fulfillPromise(readRequest, { value: chunk, done: done });
}

function readableStreamDefaultControllerEnqueue(controller, chunk)
{
    "use strict";

    const stream = @getByIdDirectPrivate(controller, "controlledReadableStream");
    @assert(@readableStreamDefaultControllerCanCloseOrEnqueue(controller));

    if (@isReadableStreamLocked(stream) && @getByIdDirectPrivate(@getByIdDirectPrivate(stream, "reader"), "readRequests").length) {
        @readableStreamFulfillReadRequest(stream, chunk, false);
        @readableStreamDefaultControllerCallPullIfNeeded(controller);
        return;
    }

    try {
        let chunkSize = 1;
        if (@getByIdDirectPrivate(controller, "strategy").size !== @undefined)
            chunkSize = @getByIdDirectPrivate(controller, "strategy").size(chunk);
        @enqueueValueWithSize(@getByIdDirectPrivate(controller, "queue"), chunk, chunkSize);
    }
    catch(error) {
        @readableStreamDefaultControllerError(controller, error);
        throw error;
    }
    @readableStreamDefaultControllerCallPullIfNeeded(controller);
}

function readableStreamDefaultReaderRead(reader)
{
    "use strict";

    const stream = @getByIdDirectPrivate(reader, "ownerReadableStream");
    @assert(!!stream);
    const state = @getByIdDirectPrivate(stream, "state");

    @putByIdDirectPrivate(stream, "disturbed", true);
    if (state === @streamClosed)
        return @createFulfilledPromise({ value: @undefined, done: true });
    if (state === @streamErrored)
        return @Promise.@reject(@getByIdDirectPrivate(stream, "storedError"));
    @assert(state === @streamReadable);

    return @getByIdDirectPrivate(stream, "readableStreamController").@pull(@getByIdDirectPrivate(stream, "readableStreamController"));
}

function readableStreamAddReadRequest(stream)
{
    "use strict";

    @assert(@isReadableStreamDefaultReader(@getByIdDirectPrivate(stream, "reader")));
    @assert(@getByIdDirectPrivate(stream, "state") == @streamReadable);

    const readRequest = @newPromise();
    @arrayPush(@getByIdDirectPrivate(@getByIdDirectPrivate(stream, "reader"), "readRequests"), readRequest);

    return readRequest;
}

function isReadableStreamDisturbed(stream)
{
    "use strict";

    @assert(@isReadableStream(stream));
    return @getByIdDirectPrivate(stream, "disturbed");
}

function readableStreamDefaultReaderRelease(reader)
{
    @readableStreamReaderGenericRelease(reader);
    @readableStreamDefaultReaderErrorReadRequests(reader, @makeTypeError("releasing lock of reader"));
}

function readableStreamReaderGenericRelease(reader)
{
    "use strict";

    @assert(!!@getByIdDirectPrivate(reader, "ownerReadableStream"));
    @assert(@getByIdDirectPrivate(@getByIdDirectPrivate(reader, "ownerReadableStream"), "reader") === reader);

    if (@getByIdDirectPrivate(@getByIdDirectPrivate(reader, "ownerReadableStream"), "state") === @streamReadable)
        @getByIdDirectPrivate(reader, "closedPromiseCapability").@reject.@call(@undefined, @makeTypeError("releasing lock of reader whose stream is still in readable state"));
    else
        @putByIdDirectPrivate(reader, "closedPromiseCapability", { @promise: @newHandledRejectedPromise(@makeTypeError("reader released lock")) });

    const promise = @getByIdDirectPrivate(reader, "closedPromiseCapability").@promise;
    @markPromiseAsHandled(promise);
    @putByIdDirectPrivate(@getByIdDirectPrivate(reader, "ownerReadableStream"), "reader", @undefined);
    @putByIdDirectPrivate(reader, "ownerReadableStream", @undefined);
}

function readableStreamDefaultReaderErrorReadRequests(reader, error)
{
    const requests = @getByIdDirectPrivate(reader, "readRequests");
    @putByIdDirectPrivate(reader, "readRequests", []);
    for (let index = 0, length = requests.length; index < length; ++index)
        @rejectPromise(requests[index], error);
}

function readableStreamDefaultControllerCanCloseOrEnqueue(controller)
{
    "use strict";

    return !@getByIdDirectPrivate(controller, "closeRequested") && @getByIdDirectPrivate(@getByIdDirectPrivate(controller, "controlledReadableStream"), "state") === @streamReadable;
}
