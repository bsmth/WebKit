/*
 * Copyright (C) 2019 Apple Inc. All rights reserved.
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
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

#import "config.h"
#import "CcidService.h"

#if ENABLE(WEB_AUTHN)

#import "CcidConnection.h"
#import "CtapCcidDriver.h"
#import <CryptoTokenKit/TKSmartCard.h>
#import <WebCore/AuthenticatorTransport.h>
#import <wtf/BlockPtr.h>
#import <wtf/RunLoop.h>

@interface _WKSmartCardSlotObserver : NSObject {
    WeakPtr<WebKit::CcidService> m_service;
}

- (instancetype)initWithService:(WeakPtr<WebKit::CcidService>&&)service;
- (void)observeValueForKeyPath:(id)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context;
@end

@interface _WKSmartCardSlotStateObserver : NSObject {
    WeakPtr<WebKit::CcidService> m_service;
    RetainPtr<TKSmartCardSlot> m_slot;
}

- (instancetype)initWithService:(WeakPtr<WebKit::CcidService>&&)service slot:(RetainPtr<TKSmartCardSlot>&&)slot;
- (void)observeValueForKeyPath:(id)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context;
@end

namespace WebKit {

CcidService::CcidService(Observer& observer)
    : FidoService(observer)
    , m_restartTimer(RunLoop::main(), this, &CcidService::platformStartDiscovery)
{
}

CcidService::~CcidService()
{
}

void CcidService::didConnectTag()
{
    auto connection = m_connection;
    getInfo(WTF::makeUnique<CtapCcidDriver>(connection.releaseNonNull(), m_connection->contactless() ? WebCore::AuthenticatorTransport::Nfc : WebCore::AuthenticatorTransport::SmartCard));
}

void CcidService::startDiscoveryInternal()
{
    platformStartDiscovery();
}

void CcidService::restartDiscoveryInternal()
{
    m_restartTimer.startOneShot(1_s); // Magic number to give users enough time for reactions.
}

void CcidService::platformStartDiscovery()
{
    [[TKSmartCardSlotManager defaultManager] addObserver:adoptNS([[_WKSmartCardSlotObserver alloc] initWithService:this]).get() forKeyPath:@"slotNames" options:NSKeyValueObservingOptionNew | NSKeyValueObservingOptionInitial context:nil];
}

void CcidService::onValidCard(RetainPtr<TKSmartCard>&& smartCard)
{
    m_connection = WebKit::CcidConnection::create(WTFMove(smartCard), *this);
}

void CcidService::updateSlots(NSArray *slots)
{
    HashSet<String> slotsSet;
    for (NSString *nsName : slots) {
        auto name = String(nsName);
        slotsSet.add(name);
        auto it = m_slotNames.find(name);
        if (it == m_slotNames.end()) {
            m_slotNames.add(name);
            [[TKSmartCardSlotManager defaultManager] getSlotWithName:nsName reply:makeBlockPtr([this](TKSmartCardSlot * _Nullable slot) mutable {
                [slot addObserver:adoptNS([[_WKSmartCardSlotStateObserver alloc] initWithService:this slot:WTFMove(slot)]).get() forKeyPath:@"state" options:NSKeyValueObservingOptionNew | NSKeyValueObservingOptionInitial context:nil];
            }).get()];
        }
    }
    HashSet<String> staleSlots;
    for (const String& slot : m_slotNames) {
        if (!slotsSet.contains(slot))
            staleSlots.add(slot);
    }
    for (const String& slot : staleSlots)
        m_slotNames.remove(slot);
}

} // namespace WebKit

@implementation _WKSmartCardSlotObserver
- (instancetype)initWithService:(WeakPtr<WebKit::CcidService>&&)service
{
    if (!(self = [super init]))
        return nil;

    m_service = WTFMove(service);

    return self;
}

- (void)observeValueForKeyPath:(id)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context
{
    UNUSED_PARAM(object);
    UNUSED_PARAM(change);
    UNUSED_PARAM(context);

    callOnMainRunLoop([service = m_service, change = retainPtr(change)] () mutable {
        if (!service)
            return;
        service->updateSlots(change.get()[NSKeyValueChangeNewKey]);
    });
}
@end

@implementation _WKSmartCardSlotStateObserver
- (instancetype)initWithService:(WeakPtr<WebKit::CcidService>&&)service slot:(RetainPtr<TKSmartCardSlot>&&)slot
{
    if (!(self = [super init]))
        return nil;

    m_service = WTFMove(service);
    m_slot = WTFMove(slot);

    return self;
}

- (void)observeValueForKeyPath:(id)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context
{
    UNUSED_PARAM(object);
    UNUSED_PARAM(change);
    UNUSED_PARAM(context);

    if (!m_service)
        return;
    switch ([change[NSKeyValueChangeNewKey] intValue]) {
    case TKSmartCardSlotStateMissing:
        m_slot.clear();
        return;
    case TKSmartCardSlotStateValidCard: {
        auto* smartCard = [object makeSmartCard];
        callOnMainRunLoop([service = m_service, smartCard = retainPtr(smartCard)] () mutable {
            if (!service)
                return;
            service->onValidCard(WTFMove(smartCard));
        });
        break;
    }
    default:
        break;
    }
}
@end

#endif // ENABLE(WEB_AUTHN)
