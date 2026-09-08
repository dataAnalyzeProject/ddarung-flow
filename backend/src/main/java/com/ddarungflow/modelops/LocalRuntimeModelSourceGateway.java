package com.ddarungflow.modelops;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!oci")
public class LocalRuntimeModelSourceGateway implements RuntimeModelSourceGateway {
    @Override
    public Source read() {
        throw new UnavailableException();
    }
}
